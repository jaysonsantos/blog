---
title: "Connecting to services that require jumphost from terraform"
description: "If you have services that require jumphosts to connect to them because there is no VPN, direct access, or configured zero trust mechanisms, it used to be a bit painful doing it with terraform."
pubDate: 2021-08-29T20:20:03Z
updatedDate: 2021-08-30T08:26:35Z
tags: ["terraform", "tutorial", "ssh", "go"]
---

If you have services that require jumphosts to connect to them because there is no VPN, direct access, or configured zero trust mechanisms, it used to be a bit painful doing it with terraform.
Some would use things like `null_resource` to start the ssh command but still having a static number of tunnels.
Thinking of that use case, I've created a terraform provider that can play well with dependencies on resources being created like databases instances or any other services that are to be provisioned and will have a non deterministic hostname.

The cool thing is that the provider connects once to the jump host and you can have an arbitrary number of tunnels that connect to remote servers and assign a local port by using data sources. The provider itself only connects to the jump host when the first data source is being read, this will make sure that the connection only starts when you have a definitive hostname (i.e. an RDS instance that finished being provisioned). Once the jump host connection is done, many data sources can create tunnels using the same jump host connection.

## how to use it

Cutting to the chase, to use it you need to configure the provider itself with the following:
```terraform
terraform {
  required_providers {
    jumphost = {
      source = "jaysonsantos/jumphost"
      version = "0.0.2"
    }
  }
}
```
Next, configure where your jumphost is:

```terraform
provider "jumphost" {
  hostname = "my-server"
  username = "ubuntu"
}
```

Then configure the tunnels you are going to need to use:

```terraform
data "jumphost_ssh" "my_database" {
  hostname = aws_db_instance.my_database.address
  port     = aws_db_instance.my_database.port
}

// Configure a postgresql provider to use the tunnel

provider "postgresql" {
  host = "localhost" // As this will be tunneled, just use localhost
  // The port usage bellow makes sure that the provider only gets created
  // when after the database is created and the tunnel is established
  port = data.jumphost_ssh.my_database.local_port // This is the tunneled port
  // omitted the rest of the parameters
}

```

Or you can also use to reach services that you already have the host bust still need to proxy through the tunnel.
```terraform
data "jumphost_ssh" "my_api" {
  hostname = "httpbin.org"
  port     = 80
}

data "http" "my_api" {
  url = "http://localhost:${data.jumphost_ssh.my_api.local_port}/method"
}

output "api_response" {
  value = data.http.my_api.body
}
```

I hope this can help other people out there and don't forget to send issues and pull requests to my [github](https://github.com/jaysonsantos/terraform-provider-jumphost).
