---
title: "Beni: a typed functional language for the browser, with no async/await"
description: "Beni is a statically typed functional language that compiles to JavaScript."
pubDate: 2026-10-16T18:37:04Z
updatedDate: 2026-10-16T19:14:29Z
tags: ["elm", "functional", "javascript"]
---

Beni is a statically typed functional language that compiles to JavaScript. My friend Cesar ([@canassa](https://x.com/ccanassa)) started it, and I've been working on it with him. It's pre-1.0, but it's far enough along that we'd like people to try it.

You can try it in the [playground](https://canassa.github.io/beni/playground/) without installing anything. The compiler runs in the browser as WebAssembly. The code is at [github.com/canassa/beni](https://github.com/canassa/beni).

## Why Beni?

Elm showed that a web app can run for years without a runtime error. Most web apps are written in TypeScript instead, and its types don't always mean what they say.

Beni started as an Elm clone for the browser and turned into an experiment in how far current tools can be pushed, borrowing from Roc, Solid, Effect and Zig. It has three goals, and the rest of this post takes them one at a time.

### TypeScript's types can lie

TypeScript doesn't try to be sound. It's [listed as a non-goal](https://github.com/microsoft/TypeScript/wiki/TypeScript-Design-Goals), and it's easy to end up with a `string[]` that holds a number:

```ts
const names: string[] = ["ada", "grace"]
const items: (string | number)[] = names // allowed
items.push(42)

for (const name of names) {
  console.log(name.toUpperCase()) // compiles, then throws on 42
}
```

This compiles without a warning, because arrays are covariant in TypeScript. And when the checker does complain, it's easy to switch it off with `as` or `any`. That matters more now that agents write a lot of code unattended: at the first sign of a type error, an agent will often reach for `as any` and move on. Errors aren't in the types either. Nothing in a function's signature says it can throw, so the compiler can't tell you which failures you haven't handled.

Beni has no `any`, no casts and no subtyping, so a `List String` only ever holds strings, and there's no escape hatch for a person or an agent to reach for. Failures are values in the type, like the `Result` that `fetchName` returns further down. Data from outside, like JSON, comes in through a schema that checks it. And because Beni uses Hindley-Milner inference, the compiler works out the types, so you get all this without writing annotations everywhere.

## Programs that don't crash

The first goal is the one Elm already reached: if a program compiles, it shouldn't crash. Beni keeps that rule and tightens it where your code meets the browser.

### Runtime errors

Beni has no `null`, `undefined` or exceptions, and a `case` has to cover every variant. If you add a variant, the compiler lists every place that needs updating. This works the same as in Elm.

Beni code can't call JavaScript directly. Browser and Node APIs are wrapped by hand in the platform layer, and each failure an API documents is returned as a typed error such as `QuotaExceeded` or `NotFound`. Catch-all `try`/`catch` isn't allowed there. If an API fails in a way its docs don't mention, we treat it as a bug in Beni, and the program stops instead of continuing in a bad state.

So the guarantee covers the code you write. The platform layer is written and reviewed by hand, and the compiler doesn't verify it.

### Error messages

Error messages get the same attention as in Elm, and almost every one has a test that pins its wording. If you pass `foldl` a lambda that takes one argument instead of two, you get:

```text
I need a function of 2 arguments, and this one takes 1.
```

With currying, the compiler couldn't give that message, which is one of the reasons Beni dropped it.

### No automatic currying

In a curried language, a lambda with a missing parameter often still type checks, because the compiler assumes you meant to return a function. The error shows up later, usually far from the mistake. Without currying, a one-argument function and a two-argument function have different types, and the error points at the lambda.

Partial application is written with `_`, as in `List.map xs (scale 2 _)`. The `_` can stand for any argument, including the first. What you lose is point-free style.

## Output as small as hand-written JavaScript

The second goal is output that's about as small and fast as JavaScript you'd write by hand.

### Compilers are a good thing

A TypeScript project usually needs a type checker, a bundler, a minifier, a formatter and a dev server. Beni is one binary that does all of it.

We own the language as well as the compiler, so the compiler knows much more about the code than a JavaScript bundler does. It has the types, and it infers which functions are pure. That opens up optimisations a bundler can't safely do: removing code nothing uses, inlining functions, reordering and rewriting them to get the smallest bundle possible. Some of this is built, and a lot of it is still research.

Compilers for C and Haskell have done this kind of whole-program optimisation for decades. We want to see how much of it works for code that ships to a browser.

### Immutable lists without a trie

Every value in Beni is immutable, lists included. The usual way to make immutable lists fast is a persistent data structure like a trie, but in the browser that's more code to download: 1 to 1.5 kB with brotli, even for a minimal one.

Beni uses plain JavaScript arrays instead. An ownership checker, similar to Rust's borrow checker but with no annotations, works out when nothing else can see a list, and then the update happens in place. When it can't prove that, you get a compile error and add a `List.copy`.

Its core rules are modelled in Lean 4. All that to save a kilobyte and a few nanoseconds is a bit crazy, and we know it.

## A language that gets out of your way

The third goal is that safety shouldn't come with ceremony, and that the compiler should be fast enough that you never wait on it.

### No async/await

In TypeScript, once a function awaits something, every function that calls it has to become async too:

```ts
async function fetchName(id: number): Promise<string> {
  const res = await fetch(`/users/${id}`)
  return res.text()
}

// greet has to be async now, and so does everything that calls it
async function greet(id: number): Promise<string> {
  try {
    return `Hello, ${await fetchName(id)}`
  } catch {
    return "Hello, stranger"
  }
}
```

Bob Nystrom called this function coloring in [What Color Is Your Function?](https://journal.stuffwithstuff.com/2015/02/01/what-color-is-your-function/). In Beni the same code looks like this:

```elm
fetchName : Int → Result Http.Error String
fetchName id = Http.get { url = "/users/${String.fromInt id}", expect = Http.expectString }


greet : Int → String
greet id =
    case fetchName id of
        Ok name →
            "Hello, ${name}"

        Err _ →
            "Hello, stranger"
```

`fetchName` waits on the network, and `greet` calls it like any other function. An HTTP failure comes back as a `Result`, so the compiler makes you handle it.

The compiler works out which functions might wait. Each function gets two flags, whether it can suspend and whether it has side effects, and you don't write them anywhere. Functions that can suspend are compiled to run on a small fiber runtime that ships with the program. Functions that can't are compiled to plain JavaScript. Higher-order functions only need one version: `List.map` takes a callback that makes network requests the same way it takes one that doesn't.

The runtime is modeled on [Effect](https://effect.website/), so timeouts, retries, cancellation and concurrency limits are library functions. This example fetches up to 4 pages at a time, retries each one with exponential backoff, and stops after 10 seconds:

```elm
backoff : Schedule.Schedule Http.Error
backoff = Schedule.exponential (Duration.millis 100) 2.0 ▷ Schedule.upTo (Duration.seconds 5)


loadAll : List Int → Maybe (Result Http.Error (List String))
loadAll pages = Task.timeout (Duration.seconds 10) λ⊤ →
    Task.forEachOk pages 4 λn → Task.retry backoff λ⊤ → fetchPage n
```

A cancelled fiber always runs its cleanup. The runtime with these pieces is about 2.1 kB, compared to about 27 kB for Effect.

The downside is that the source doesn't show where a function might suspend. Where that matters, a `sync` block tells the compiler the code inside must never suspend, and the compiler checks everything that code calls.

### Static dispatch

Beni has static dispatch, modeled on Roc's. A type's methods are the public functions of the module that defines it, so `v.add w` calls `Vec.add v w`, resolved at compile time. Generic code can ask for a method with a `where a.add : a, a → a` clause. `==` and `<` call the type's `eq` and `compare`, which records and custom types get automatically.

This fixes two things that come up a lot in Elm. Custom types can be `Dict` keys and can be sorted, without Elm's special `comparable` type. And a method can be picked by the type you expect back, which is how JSON decoding works: `Json.decode text` finds the decoder from the result type, so you don't write one by hand for every record.

You get most of what type classes give you, without instances, orphan rules or the compile-time cost that comes with them.

### Unicode syntax

Maybe the most controversial decision 😅

We use Unicode symbols where we think they make code easier to read. It's 2026, and editors and terminals render them fine.

Also, we're having fun. What's the point of writing your own language if it looks like every other C clone?

- Haskell writes a lambda as `\x -> …` because the backslash looks a bit like a λ. Beni just uses `λx → …`.
- Tuple types are written `Int × String`. Function types already use commas for multiple arguments, so `Int × Int → Int` takes one pair and `Int, Int → Int` takes two arguments.
- Functions that return nothing useful get their own symbol, `⊤`, as in `String → ⊤`.
- The pipe is `▷`.

For the hardcore folks still typing code by hand: write `->` and `beni fmt --migrate-unicode` turns it into `→` for you. Editor plugins will do the same as you type, once they exist.

## Batteries included

### JSX

Markup is part of the language and is type checked against the elements the platform defines. It compiles the way Solid does: each template is cloned from HTML once, and only the parts that depend on changed values get updated. There's no virtual DOM. Records are immutable and unchanged fields keep their identity, so one reference comparison per dynamic part is enough to tell whether it changed.

```elm
import Html exposing (Html)
import Tea


type Msg
    = Increment
    | Decrement


update : Msg, Int → Int
update msg count =
    case msg of
        Increment →
            count + 1

        Decrement →
            count - 1


view : Int → Html Msg
view count =
    <main>
        <button onClick={Decrement}>-</button>
        <span>{count}</span>
        <button onClick={Increment}>+</button>
    </main>


main : Tea.Program
main = Tea.sandbox { init = λ⊤ → 0, update = update, view = view }
```

[Try the counter in the playground](https://canassa.github.io/beni/playground/#platform=browser-direct&code=dVExUsMwEOz1ii1hYsfQZmzPMFBAwQwFH1BsYTSJJY8lk2SMWwpK3sAv-AOPyEuQzrYmFFHh0-7t3e3JcYwbFLpTVrQraCWw7qzVCrwsjccR7KuAdp8Wlm8EkeA7flgyWTe6tbi39RZi32gjVYULDy_n3LPgjDF7aAQeTcXgToYHVbSiFsoSfsedmDFjXVNyK7Dy8sgpLY4fXz7OmdpUo2FkVF5wM5L6hbA_YYAvDiypqXKBaxboMP2MOPZi9ibFzrmaDdHOfiPiT_2kNZcqD33S6T21ut3KYpP1YdyQx2kyZk_kpuEq76nhkCaEzvcKew754n-vNBltMOajM-5-xPKp1VXL65HKiDJclWu9Rw-ppFsBvz_Hz29a8SrC9OTZdIlA22ZjGNgf&css=jVXLbus2EN37KwYuisY3ki0_EyibFt10064uChTo4lLkyCIiiQJJ20kv8j39j35ZZ0hJtuMUt1IcSEfkPM6cGS4-wecKQZpD69H-4KA25hnulJFuodDpfbvoavG6t7RAzRsF__y9me9mOXw2yvz6-8-0w792WAqJyQQAOrFna7U52ASksCoBVwllTiBaBUJKbH0CugUBtd5XPsKghH0GJytscA6fFpNJbo3x8JVMsjGbxm953PREcJqyqxy-K7d8R4gdMhSuCHl88QQtwxWh4uC9aQncPPIdwVq3bA13fEcoRktg8bguN72L0siDI0yWD-pBRSxmmEMGq-4FNvTLwO4LcZcl0P_NV7OEv2_p4zb7cMVy9jR5m0x-bFBpAXedxRKtS6_zZ6JmgZczQ-854jVPAR9JWu7ofhzAnqYVX7sB7IlCSXc5gCNVake3GOCerLVYi002gCNd-Piwe5AD_H_I2X6TnM2M7b0xQZVv6pB3IeRzFGYOR2HvYrZhYSBkQDmzgJaG41tnGSx33ctiOd_A9Besj-i1FPAbHnCawAgk8JPVoiYBi9alDq2Okjph8ax9ysZS11ARKt3ucxKyp9VaOFShjoVRryFMpR23UA57q4Ng6E1iqj02JCTmDC3DhXlJnf4rGCuMVWhTgvhLo9u0QlZ-DsssO1YBFHavqTSB_04oFTaumOAlMR1iWPTdHerthz6HAv0JsQXtqXtPBmKVXei8RlBzXoVd1hiioOT27W3Ye9FFt7dxrFcRvS0URzQbk-4VEj_Ft9lV_Bx1AsJdTJ0KBXsKMbtOxJiZqJNWvqIqy-pGCFGhoxSYbZLxQx9lgE49zassGzHarKm6aXtoSASSmBTFoRaWAceruB3OBWKEJZcGws5UsSYC0SHUPsztLjofdg_vI5FZZInlQLaJVGdqrfqE2PHsvCC1xAlPp232_XveW9PiDSExnove0G1FKfp3DGUfJykP1rGtzuhBDN5Sr2iveWb0MQWHPABdAufny_J21uytaKio03QK2tF5UL12FbZ8dhhLpkm7VOHp_TQHFLLqBctfT7SaBw1V_uCAjAtqL3rikwtMCZR1pDoJJ80zYueC7s2pDVWiPHmTk5Y6gi1ZEhbaeYjMoTS06wv991TFL1BpOhRDJwUHpTUNu0jgRLwh2SkshYR2MMS-gkT7QZoXSP4wKOCC4PXQsP2yUlvnU1npWl1t6ePIYfrnarVcTZ8-wGAB0-mlsVp8w9b9Ozv3tzYqc6QqfD0r7b_66mO8r_XYvOEQBTv075A1o-lRO13UMUZz8PGoyd7Piqw_T_gXnYXds8ughfT6GA0FXVLqTR4fa-Hxjztqp-sztxEv4_zY0UEUT9pxJPbDbtkPjIsuXfZtS7YAxnF0VePt5ZKLQTCOgs3jYHbosgG52HJVwiv7q3Hx2-Rf)

### Schemas

Almost every project I've worked on has needed a validation library like Zod or Joi. In Beni, schemas are part of the language. Because the compiler handles them, each schema is compiled into its own small, specialised JavaScript parser. You ship code only for the schemas you actually use, not a whole validation library.

```elm
schema Item =
    id : Int
    title : String
    done : Bool


firstTitle : String → String
firstTitle json =
    case Item.parse json of
        Ok item →
            item.title

        Err _ →
            "invalid"
```

[Run this example](https://canassa.github.io/beni/playground/#platform=node&code=fZDNSgQxDMfvfYrQk8LugNcFDwoeFkQFvTkidSa7E22b0sYvxKsP4CP6JLaddVg_MLfkn_zzS-ZzOIDUDegMdOwCWUwgDCQJ-NFDMDFhbOCEId57IYfwYCz1Rog9WLqJJj43ilzgKLmrR8CnwIn8GnbOIq-jcbtKqc2KpaCDfQU5qIcFLL3UREgs5vxcYp6spZ59qRwy2zy_opjk4lsXfLy9fw1sybcpg40rOpOwrmzqGaPEq6qVOL3Ld2agbDTVKloZqUhqqh_FCNe_OjX5-g6dEZ0hn-E2R4_pyFHe0oQMKsfkMU0Ol7DFrV9aTX2rF7A3g1bX9SVrdRoogAwIgaQbWl3k8p2iroxN-Kony9nflq2u_T-MPQf83-5KfQI) in the playground. It parses one valid and one invalid JSON string.

Often you don't need a schema at all. `Json.decode` works out the type from how your code uses the result, and checks the JSON against it. If your code reads `user.name` as a string, the JSON has to have a `name` that's a string, and you never write a type annotation. When decoding fails, each error says whether the text wasn't JSON at all or the JSON didn't fit, along with where and why. [This small page](https://canassa.github.io/beni/playground/#platform=browser-direct&code=ZVJLTgMxDN3nFNasQKqmG1ZV0x0IKqCVCrtKKHTc1qKTjJJMPxrNlgVLzsAtuAOH6EnIZ6Yf1Zskfrbfsx3KC6Ut3Nt8BbgtlCG5gCv_vGYUsaFRsr1PZkvMRft6QcEYs7sC4cksGDjjcJuRxQwmVrtSDi6LTFiEng_pNG7Yf363EQ2emwW8AQ9FZsJEh5qHt7emrMWt9dkHvzfvdExmqUrriC45IhJyTxh8Y2mGM5VhxE7oRh9QGtQXVLFgatVrUTjYx6RS5MiOQrUGMqZEc5FMc3gkY1Mhd23I3y8FoZQGGZw3I07HQhu8E7TyTS9RnhXylpBcixVlMJyMnpMzGFcGL-OlsiCC4sQNa024OZ9V-AN-jwE6GVY_FyQHh4J9DwmNArTaGF7d1OCElMgrD9Sg5IMsSsuruLIauie5bg8OG1THjdT9buOMZN3Ixpg_nUL3ydKxVgst8ujiwWWEzN7VFiogSU6pm-T-6yc0klQwTfxSpknP3d5R0jSBOulA89d4c-lAaJXHo2b_&css=jZRvb5swEMbf51OcMk1KKpwCIWlK32yaNE2T2r3ovoCBA6wARsZJ2k397vPZJk36RytOJPz44rv7-XEuL-B3jdBIuQVZgjbvfcMfKyV3XQEDb_sGhxQ45NhphQXkXBUBNKKqNXATUnC1XcDF5WSSKik1_J0A5LKRig15jS2mLvbGyIz1vDLCp3JFw0m0H0n2cZLGB22kyD5OancaKWyd0XBaIzraDNc0nMRzKtOI2WZZJj7DUPNCHlIIIe4fIDHfEFSV8VkYgP8s4nlA6yuzuArfjIjmN5OnyeRLi4XgMOsVlqgGdt4qwZhbBM8wXuKgmBurH3lEazM2o-iJxPSsR9EzwdyMchRHKtf8mvN4VD2XJV_yJBzFIxncXK2v8lH-CJvVf9kkc9rvifjUum1s2xnPt85FKey5mrlmbaDlMarUmFVLSfUtwxCidf9wGS0SmP7AZo9a5BzucIfTAI5CAF-V4E1gLNoNbEAlSns-mSwebf5CDGTkFColCtrfzHJkQmNr_EwwUJGcyQc2iD-iq1LzrgpUzEi00oqO1UjmTSEKw31tRa4q0RlgdkteFPaHVLFN33LRvZ2-4v0YB3AQha5TyjBLYsM0oASf52d7xomLfQ2SDDI_1u5P0C252fxYS5pmWEqF_lqapgny9Of9r7vpq6OwdjqeBVExPopiV0aD2hBjQ89zW164CDfYPiMx1LSWbQps41nQyXKF3NnhXcyeBQE4Z-oTu2gzN9YbZCMKXy3ZfP42oA85LUqsy1awE6yVnaTOMIDp_Xe4NVNjtlvsGhnAN9mZvHwI4BhGuyh0gPaoyJDNWc9pKfPdYDuXO-1uZPyiAXclbUU-hsmyHNDUxiLP0Cz0O33uqKyR-fYEFdPyxFoertPeQ3bG5aSOk3NfevxWOvhrsArDd7wQOy9Q_4ybf_zu9I5Jw6hs5IEdFN0C3j0ealRIHf4D) in the playground shows it: type into the box, and it shows the name in capitals, "invalid JSON" when the text can't be parsed, or "not a user" when it parses but doesn't fit.

When the JSON doesn't match your types, for example renamed keys or default values, you write a `schema`.

## Platforms

The language itself knows nothing about where it runs. That idea comes from [Roc](https://www.roc-lang.org/). A platform supplies the program's `main`, its effects and its bindings to JavaScript. Beni ships platforms for Node and for the browser, with or without The Elm Architecture.

This is also how Beni gets out of Elm's walled garden. In Elm, your code can't call JavaScript, and ports are the only way out. In Beni, every line of JavaScript lives in a platform, wrapped so that each failure comes back as a typed value. When you need something the shipped platforms don't cover, like an npm library or a browser API, you add your own platform layer to the project. Libraries stay pure Beni, so a dependency can't break the guarantees.

We want people to fork the shipped platforms and change them for their own needs. A Bun or Deno platform could expose what those runtimes offer beyond Node. A `node-static` platform could render each route of an app into a static HTML file.

## Apps built with Beni

The [examples site](https://canassa.github.io/beni/) has three apps, each built with `--release` and served as is, without a bundler:

- Conduit, the RealWorld Medium clone, structured like elm-spa-example
- Bike Wars, a two-player light-cycle game ported from Elm
- Sternhalma, Chinese checkers for up to six players, also ported from Elm

## Current state

Beni is pre-1.0, and the syntax still changes often. There's no package manager, editor support, user documentation or test runner yet. It's not ready for production.

## Trying it

The easiest way is the [playground](https://canassa.github.io/beni/playground/). Pick a sample such as Counter or TodoMVC, edit it, and share the link. You can add your own CSS too.

To run it locally, the repo pins Zig 0.17 and Node 24 with a Nix flake (`direnv allow` puts them on your `PATH`):

```sh
git clone https://github.com/canassa/beni && cd beni
zig build
./zig-out/bin/beni new --platform=browser-tea hello
./zig-out/bin/beni serve hello
```

`serve` rebuilds and reloads the page when you save.

If something breaks, or an error message doesn't make sense, please [open an issue](https://github.com/canassa/beni/issues). We'd especially like to hear from Elm users about the changes, removing currying in particular.
