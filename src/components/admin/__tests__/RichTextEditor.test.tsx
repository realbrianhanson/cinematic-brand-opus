// @vitest-environment jsdom
import React, { StrictMode } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Editor } from "@tiptap/react";
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("../ImagePickerModal", () => ({ default: () => null }));
vi.mock("../VideoPickerModal", () => ({ default: () => null }));
import RichTextEditor from "../RichTextEditor";
import {
  findDroppedElements,
  serializeEditorHtml,
} from "../extensions/contentFidelity";
describe("rich editor lifecycle", () => {
  it("keeps content updates working and clears the parent reference on disposal", async () => {
    let current: Editor | null = null;
    const changes = vi.fn();
    const ready = (editor: Editor | null) => {
      current = editor;
    };
    const view = render(
      <StrictMode>
        <RichTextEditor
          content="<p>Original</p>"
          onChange={changes}
          onEditorReady={ready}
        />
      </StrictMode>,
    );
    await waitFor(() => expect(current?.isInitialized).toBe(true));
    const original = current!;
    act(() => {
      original.commands.insertContent("Updated ");
    });
    expect(changes).toHaveBeenCalled();
    expect(changes.mock.lastCall?.[0]).toContain("Updated");
    view.unmount();
    await waitFor(() => expect(current).toBeNull());
    expect(original.isDestroyed).toBe(true);
    const next = render(
      <RichTextEditor content="<p>New document</p>" onEditorReady={ready} />,
    );
    await waitFor(() => expect(current?.isInitialized).toBe(true));
    expect(current).not.toBe(original);
    expect(current!.getHTML()).toContain("New document");
    next.unmount();
  });
});

const ARTICLE = [
  "<h2>Compare the tools</h2>",
  "<p>Prices as of 2026<sup>1</sup>, and water is H<sub>2</sub>O.</p>",
  "<table><thead><tr><th>Tool</th><th>Price</th><th>Best for</th></tr></thead>",
  "<tbody><tr><td>Alpha</td><td>$10</td><td>Solo founders</td></tr>",
  '<tr><td>Beta</td><td>$20</td><td><a href="https://beta.test">Teams</a></td></tr></tbody></table>',
  '<figure><img src="https://cdn.test/chart.png" alt="Revenue chart" title="Chart" width="800" height="450" loading="lazy">',
  "<figcaption>Revenue grew <em>3x</em></figcaption></figure>",
  "<h4>Fine print</h4>",
  '<div class="callout"><p>Prices change often.</p></div>',
  '<iframe src="https://www.youtube.com/embed/abc"></iframe>',
].join("");

async function loadInEditor(html: string) {
  let current: Editor | null = null;
  const view = render(
    <RichTextEditor
      content={html}
      onEditorReady={(e) => {
        current = e;
      }}
    />,
  );
  await waitFor(() => expect(current?.isInitialized).toBe(true));
  return { editor: current! as Editor, view };
}

describe("rich editor article fidelity", () => {
  it("keeps tables, figures, h4, sup/sub, classed divs and image attributes", async () => {
    const { editor, view } = await loadInEditor(ARTICLE);
    const doc = new DOMParser().parseFromString(editor.getHTML(), "text/html");
    expect(doc.querySelectorAll("table").length).toBe(1);
    expect(doc.querySelectorAll("table tr").length).toBe(3);
    expect([...doc.querySelectorAll("th")].map((c) => c.textContent)).toEqual([
      "Tool",
      "Price",
      "Best for",
    ]);
    expect(doc.querySelectorAll("td").length).toBe(6);
    expect(doc.querySelector("td a")?.getAttribute("href")).toBe(
      "https://beta.test",
    );
    // Not flattened into one run-on paragraph.
    expect(editor.getHTML()).not.toMatch(/<p>ToolPrice/);
    const img = doc.querySelector("figure > img")!;
    expect(img).toBeTruthy();
    expect(img.getAttribute("alt")).toBe("Revenue chart");
    expect(img.getAttribute("title")).toBe("Chart");
    expect(img.getAttribute("width")).toBe("800");
    expect(img.getAttribute("height")).toBe("450");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(doc.querySelector("figure > figcaption")?.innerHTML).toBe(
      "Revenue grew <em>3x</em>",
    );
    expect(doc.querySelector("h4")?.textContent).toBe("Fine print");
    expect(doc.querySelector("sup")?.textContent).toBe("1");
    expect(doc.querySelector("sub")?.textContent).toBe("2");
    expect(doc.querySelector("div.callout > p")?.textContent).toBe(
      "Prices change often.",
    );
    expect(doc.querySelectorAll("iframe").length).toBe(1);
    view.unmount();
  });

  it("emits normalized HTML that keeps thead and loses nothing from the source", async () => {
    const changes = vi.fn();
    let current: Editor | null = null;
    const view = render(
      <RichTextEditor
        content={ARTICLE}
        onChange={changes}
        onEditorReady={(e) => {
          current = e;
        }}
      />,
    );
    await waitFor(() => expect(current?.isInitialized).toBe(true));
    act(() => {
      current!.commands.insertContentAt(0, "<p>Intro</p>");
    });
    const emitted: string = changes.mock.lastCall?.[0];
    const doc = new DOMParser().parseFromString(emitted, "text/html");
    expect(doc.querySelectorAll("thead th").length).toBe(3);
    expect(doc.querySelectorAll("tbody tr").length).toBe(2);
    expect(doc.querySelector("td")?.innerHTML).toBe("Alpha");
    expect(findDroppedElements(ARTICLE, emitted)).toEqual([]);
    view.unmount();
  });

  it("round-trips its own output without growing wrappers", async () => {
    const first = await loadInEditor(ARTICLE);
    const once = serializeEditorHtml(first.editor);
    first.view.unmount();
    const second = await loadInEditor(once);
    expect(serializeEditorHtml(second.editor)).toBe(once);
    second.view.unmount();
  });
});
