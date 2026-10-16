import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDate, isSameDay } from "../src/lib/dates.ts";
import { postPath, tagPath } from "../src/lib/paths.ts";

describe("dates", () => {
  it("formats in UTC, so a late post keeps its day", () => {
    assert.equal(formatDate(new Date("2021-08-29T23:30:00Z")), "Aug 29, 2021");
  });

  it("compares calendar days in UTC", () => {
    assert.ok(isSameDay(new Date("2026-10-16T18:37:04Z"), new Date("2026-10-16T19:14:29Z")));
    assert.ok(!isSameDay(new Date("2021-02-20T07:48:40Z"), new Date("2021-02-23T06:19:10Z")));
  });
});

describe("paths", () => {
  it("builds post and tag paths with a trailing slash", () => {
    assert.equal(postPath("a-post"), "/posts/a-post/");
    assert.equal(tagPath("terraform"), "/tags/terraform/");
  });

  it("encodes characters that are not safe in a path", () => {
    assert.equal(tagPath("c#"), "/tags/c%23/");
  });
});
