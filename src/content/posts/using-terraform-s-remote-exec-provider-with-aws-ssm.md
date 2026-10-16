---
title: "Using terraform's remote-exec provider with AWS SSM"
description: "In an effort to harden our infrastructure at Grover, we decided to block all SSH connections, from both public and private subnets."
pubDate: 2021-02-20T07:48:40Z
updatedDate: 2021-02-23T06:19:10Z
tags: ["terraform", "aws"]
---

In an effort to harden our infrastructure at Grover, we decided to block all SSH connections, from both public and private subnets. Instead, we want to use AWS's SSM agent to manage SSH connections so we don't have to handle each of the machine's authorized keys. Users can connect with the provided tool as long as they have the right IAM permissions.

This worked great! I mean, almost perfect. Well, some stuff broke. There were problems because some of our terraform modules used provisioners with remote-exec so we have fine-grained control on when the creation of the machine failed.

To fix it, we tried to [set up an ssh_config](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-enable-ssh-connections.html) and change the host where it tried to connect, so terraform could execute the proxy command to connect and then do its thing. But it seemed that terraform was not reading the config at all so that just failed. I assumed that terraform was using some go module to connect and not something like libssh.

Then I thought I could run ssh on a local-exec provider with a random port forwarding to the target machine, then going to the background so it would go to the next provisioner on our module. But instead of going to the next step, it would always get stuck, waiting for it to finish somehow no matter how I tried running it. I tried `ssh -f`, `nohup ssh -f & && disown`, but I was getting nowhere and decided to take a look on the go code.


First I saw [that the code opens a pipe](https://github.com/hashicorp/terraform/blob/4e345b6d27b28d22a6f465dabd5a182e9b8ee8b5/builtin/provisioners/local-exec/resource_provisioner.go#L117).
```go
pr, pw, err := os.Pipe()
```
But a few [lines later](https://github.com/hashicorp/terraform/blob/4e345b6d27b28d22a6f465dabd5a182e9b8ee8b5/builtin/provisioners/local-exec/resource_provisioner.go#L154) it just waits for the process to finish.
```go
err = cmd.Wait()
```
And I thought: "Well when I disown, the bash program should have finished without any children as disown would move the subprocess up into the tree". And it indeed was working properly.
A few lines later, I noticed a [select on a couple of channels](https://github.com/hashicorp/terraform/blob/4e345b6d27b28d22a6f465dabd5a182e9b8ee8b5/builtin/provisioners/local-exec/resource_provisioner.go#L164-L167).
```go
select {
    case <-copyDoneCh:
    case <-p.ctx.Done():
}
```
See that `copyDoneCh`? It is used [on a function](https://github.com/hashicorp/terraform/blob/4e345b6d27b28d22a6f465dabd5a182e9b8ee8b5/builtin/provisioners/local-exec/resource_provisioner.go#L187-L193) that keeps reading the pipe until it is finished and then it gets closed when the function is finished.
```go
func copyUIOutput(o provisioners.UIOutput, r io.Reader, doneCh chan<- struct{}) {
	defer close(doneCh)
	lr := linereader.New(r)
	for line := range lr.Ch {
		o.Output(line)
	}
}
```
Remember that opened pipe on the top? Well, my naïve approach with `ssh -f` was inheriting the main process' pipe and never closing it when ssh went to the background.
So, it was a matter of making the process not inherit them so my bash script could and terraform could move to the next step.

To test this, you can start with a [null_resource](https://registry.terraform.io/providers/hashicorp/null/latest/docs/resources/resource).

```hcl
resource "null_resource" "test" {
  provisioner "local-exec" {
    command     = file("ssh-port-forward.sh")
    interpreter = ["bash", "-c"]
    environment = {
      INSTANCE_ID = "i-bebacafe"
      USERNAME    = "your-user"
      RANDOM_PORT = random_integer.ssh_port.result
    }
  }

  provisioner "remote-exec" {
    inline = ["echo hello world"]
    connection {
      host = "127.0.0.1"
      port = random_integer.ssh_port.result
      user = "your-user"
    }
  }
}

resource "random_integer" "ssh_port" {
  min = "10000"
  max = "60000"
}
```
And then for the bash script that creates the port forwarding.
```bash
#!/usr/bin/env bash
set -ex
test -n "$INSTANCE_ID" || (echo missing INSTANCE_ID; exit 1)
test -n "$USERNAME"    || (echo missing USERNAME; exit 1)
test -n "$RANDOM_PORT" || (echo missing RANDOM_PORT; exit 1)

set +e

cleanup() {
    cat log.txt
    rm -rf log.txt
    exit $!
}

for try in {0..25}; do
    echo "Trying to port forward retry #$try"
    # The following command MUST NOT print to the stdio otherwise it will just
    # inherit the pipe from the parent process and will hold terraform's lock
    ssh -f -oStrictHostKeyChecking=no \
        "$USERNAME@$INSTANCE_ID" \
        -L "127.0.0.1:$RANDOM_PORT:127.0.0.1:22" \
        sleep 1h &> log.txt  # This is the special ingredient!
    success="$?"
    if [ "$success" -eq 0 ]; then
        cleanup 0
    fi
    sleep 5s
done

echo "Failed to start a port forwarding session"
cleanup 1
```
Notice how on the ssh command I redirect all the output to a file with `&> log.txt`? This is to avoid its process to inherit the pipes I was talking about before.
After this, your plan should just work the way you expect it.
```
null_resource.test: Creating...
null_resource.test: Provisioning with 'local-exec'...
null_resource.test (local-exec): Executing: ["bash" "-c" "#!/usr/bin/env bash\nset -ex\ntest -n \"$INSTANCE_ID\" || (echo missing INSTANCE_ID; exit 1)\ntest -n \"$USERNAME\"    || (echo missing USERNAME; exit 1)\ntest -n \"$RANDOM_PORT\" || (echo missing RANDOM_PORT; exit 1)\n\nset +e\n\ncleanup() {\n    cat log.txt\n    rm -rf log.txt\n    exit $!\n}\n\nfor try in {0..25}; do\n    echo \"Trying to port forward retry #$try\"\n    # The following command MUST NOT print to the stdio otherwise it will just\n    # inherit the pipe from the parent process and will hold terraform's lock\n    ssh -f -oStrictHostKeyChecking=no \\\n        \"$USERNAME@$INSTANCE_ID\" \\\n        -L \"127.0.0.1:$RANDOM_PORT:127.0.0.1:22\" \\\n        sleep 1h &> log.txt\n    success=\"$?\"\n    if [ \"$success\" -eq 0 ]; then\n        cleanup 0\n    fi\n    sleep 5s\ndone\n\necho \"Failed to start a port forwarding session\"\ncleanup 1"]
null_resource.test (local-exec): + test -n i-bebacafe
null_resource.test (local-exec): + test -n your-user
null_resource.test (local-exec): + test -n 45160
null_resource.test (local-exec): + set +e
null_resource.test (local-exec): + for try in {0..25}
null_resource.test (local-exec): + echo 'Trying to port forward retry #0'
null_resource.test (local-exec): Trying to port forward retry #0
null_resource.test (local-exec): + ssh -f -oStrictHostKeyChecking=no your-user@i-bebacafe -L 127.0.0.1:45160:127.0.0.1:22 sleep 1h
null_resource.test (local-exec): + success=0
null_resource.test (local-exec): + '[' 0 -eq 0 ']'
null_resource.test (local-exec): + cleanup 0
null_resource.test (local-exec): + cat log.txt
null_resource.test (local-exec): + rm -rf log.txt
null_resource.test (local-exec): + exit
null_resource.test: Provisioning with 'remote-exec'...
null_resource.test (remote-exec): Connecting to remote host via SSH...
null_resource.test (remote-exec):   Host: 127.0.0.1
null_resource.test (remote-exec):   User: your-user
null_resource.test (remote-exec):   Password: false
null_resource.test (remote-exec):   Private key: false
null_resource.test (remote-exec):   Certificate: false
null_resource.test (remote-exec):   SSH Agent: true
null_resource.test (remote-exec):   Checking Host Key: false
null_resource.test (remote-exec): Connected!
null_resource.test (remote-exec): hello world
null_resource.test: Creation complete after 3s [id=1103075062717627803]
```
I hope this helps someone out there as it took me a bunch of hours to figure out what the problem was.
