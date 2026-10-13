import { describe, expect, it } from "vitest";
import { splitPostContent } from "./postContent";

describe("splitPostContent", () => {
  it("renders HTTPS image URLs while preserving surrounding text and punctuation", () => {
    expect(splitPostContent("Look https://cdn.example/picture.JPG?width=200, thanks")).toEqual([
      { text: "Look " },
      { image: "https://cdn.example/picture.JPG?width=200" },
      { text: ", thanks" },
    ]);
  });

  it("recognizes direct X and Twitter status URLs but rejects other hosts", () => {
    expect(splitPostContent("From https://twitter.com/example/status/12345/photo/1.")).toEqual([
      { text: "From " },
      { xPost: { id: "12345", url: "https://x.com/i/status/12345" } },
      { text: "." },
    ]);
    expect(splitPostContent("https://evil.example/user/status/42")).toEqual([
      { text: "https://evil.example/user/status/42" },
    ]);
  });

  it("leaves non-image and non-HTTPS URLs as text", () => {
    const content = "https://example.com/page http://example.com/photo.png";
    expect(splitPostContent(content)).toEqual([{ text: content }]);
  });
});
