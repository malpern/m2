"use client";

import { useState, useTransition, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { submitFeedback, deleteFeedback, type FeedbackItem } from "./feedback-actions";

function StatusDot({ state }: { state: string }) {
  return (
    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
      state === "closed" ? "bg-emerald-500" : "bg-amber-500"
    }`} />
  );
}

export function FeedbackSection({ initialItems }: { initialItems: FeedbackItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!title.trim()) return;
    const fullBody = imagePreview
      ? `${body}\n\n![Screenshot](${imagePreview})`
      : body;

    startTransition(async () => {
      try {
        const item = await submitFeedback(title.trim(), fullBody);
        setItems([item, ...items]);
        setTitle("");
        setBody("");
        setImagePreview(null);
      } catch (e) {
        alert("Failed to submit feedback. Please try again.");
      }
    });
  };

  const handleDelete = (number: number) => {
    startTransition(async () => {
      await deleteFeedback(number);
      setItems(items.filter((i) => i.number !== number));
    });
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const file = e.clipboardData.files[0];
    if (file?.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file?.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Filter out deleted items
  const visibleItems = items.filter((i) => !(i.state === "closed" && i.body?.includes("deleted")));

  return (
    <div>
      <h2 className="text-lg font-bold mb-2">Feedback</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Hey Matt — if something&apos;s broken, confusing, or you have an idea for how this could work better, drop it here. Micah will see it right away and track it until it&apos;s fixed. You can paste screenshots too.
      </p>

      <Card className="mb-6">
        <CardContent className="pt-5 space-y-3">
          <input
            type="text"
            placeholder="What's on your mind?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Feedback title"
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <textarea
            placeholder="Details (optional) — you can paste screenshots here"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={handlePaste}
            rows={3}
            aria-label="Feedback details"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {imagePreview && (
            <div className="relative inline-block">
              <img src={imagePreview} alt="Screenshot" className="max-h-32 rounded-md border border-border" />
              <button
                onClick={() => setImagePreview(null)}
                className="absolute -top-2 -right-2 w-5 h-5 bg-background border border-border rounded-full flex items-center justify-center text-xs text-muted-foreground hover:text-foreground"
                aria-label="Remove screenshot"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSubmit} disabled={!title.trim() || isPending}>
              {isPending ? "Submitting..." : "Submit"}
            </Button>
            <button
              onClick={() => fileRef.current?.click()}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              + Add photo
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} aria-label="Upload screenshot" />
          </div>
        </CardContent>
      </Card>

      {visibleItems.length > 0 && (
        <div className="space-y-2">
          {visibleItems.map((item) => (
            <a
              key={item.number}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Card className="hover:border-foreground/20 transition-colors">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start gap-3">
                    <StatusDot state={item.state} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{item.title}</span>
                        <span className="text-xs text-muted-foreground">#{item.number}</span>
                      </div>
                      {item.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {item.body.replace(/!\[.*?\]\(.*?\)/g, "[image]").slice(0, 120)}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                        <span className={`text-[10px] font-medium ${item.state === "closed" ? "text-emerald-400" : "text-amber-400"}`}>
                          {item.state === "closed" ? "Resolved" : "Open"}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete(item.number);
                      }}
                      className="text-xs text-muted-foreground/50 hover:text-red-400 transition-colors flex-shrink-0"
                      aria-label={`Delete feedback: ${item.title}`}
                    >
                      ✕
                    </button>
                  </div>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
