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

  it("leaves non-image and non-HTTPS URLs as text", () => {
    const content = "https://example.com/page http://example.com/photo.png";
    expect(splitPostContent(content)).toEqual([{ text: content }]);
  });
});
