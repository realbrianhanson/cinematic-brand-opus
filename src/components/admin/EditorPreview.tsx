import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { safeHtml } from "@/lib/safeHtml";
export default function EditorPreview({
  title,
  content,
  excerpt,
}: {
  title: string;
  content: string;
  excerpt: string;
}) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  return (
    <>
      <button className="admin-btn-ghost" onClick={() => setOpen(true)}>
        Preview
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[90dvh] overflow-auto">
          <DialogTitle>Article preview</DialogTitle>
          <div className="flex gap-2">
            <button aria-pressed={!mobile} onClick={() => setMobile(false)}>
              Desktop
            </button>
            <button aria-pressed={mobile} onClick={() => setMobile(true)}>
              Mobile
            </button>
          </div>
          <div
            className="mx-auto w-full rounded-lg bg-[#faf8f3] text-[#202020] p-6"
            style={{ maxWidth: mobile ? 390 : 800 }}
          >
            <h1 className="font-heading text-3xl mb-4">
              {title || "Untitled article"}
            </h1>
            <p className="mb-6 text-gray-600">{excerpt}</p>
            <article
              className="article-reading prose prose-neutral max-w-none"
              dangerouslySetInnerHTML={{ __html: safeHtml(content) }}
            />
          </div>
          <p className="text-xs">
            Preview only. Changes are applied when you save the article.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
