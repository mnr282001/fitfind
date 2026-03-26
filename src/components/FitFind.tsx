"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, DragEvent, JSX, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FitFindAuthWall } from "@/components/fitfind/FitFindAuthWall";
import { FitFindNav } from "@/components/fitfind/FitFindNav";
import { FitFindResultsState } from "@/components/fitfind/FitFindResultsState";
import { FitFindStyles } from "@/components/fitfind/FitFindStyles";
import { FitFindUploadState } from "@/components/fitfind/FitFindUploadState";
import {
  FitFindUser,
  OutfitItem,
  Phase,
  RateLimiter,
  fileToBase64,
  identifyOutfit,
  normalizeImageFileForWeb,
  searchProduct,
  trackClick,
} from "@/components/fitfind/shared";

export default function FitFind({ user, isAdmin }: { user: FitFindUser | null; isAdmin: boolean }): JSX.Element {
  const router = useRouter();
  const [image, setImage] = useState<string | null>(null);
  const [items, setItems] = useState<OutfitItem[]>([]);
  const [identifiedCount, setIdentifiedCount] = useState<number>(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<string>("");
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [error, setError] = useState<string>("");
  const [remaining, setRemaining] = useState<number>(RateLimiter.LIMIT);
  const [showUpgrade, setShowUpgrade] = useState<boolean>(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewBlobUrlRef = useRef<string | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const resultsAnchorRef = useRef<HTMLDivElement | null>(null);

  const revokePreviewUrl = useCallback(() => {
    if (previewBlobUrlRef.current) {
      URL.revokeObjectURL(previewBlobUrlRef.current);
      previewBlobUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    setRemaining(RateLimiter.remaining());
  }, []);

  useEffect(() => () => revokePreviewUrl(), [revokePreviewUrl]);

  const scrollToResults = useCallback(() => {
    const target = timelineRef.current ?? resultsAnchorRef.current;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    if (!image) return;
    if (phase !== "analyzing" && phase !== "searching") return;
    const id = window.setTimeout(() => {
      // Double RAF ensures layout has committed before scrolling.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => scrollToResults());
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [image, phase, items.length, scrollToResults]);

  const handleSignOut = useCallback(async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (e) {
      console.error(e);
    }
    router.refresh();
  }, [router]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError("");

    const fileCheck = RateLimiter.validateFile(file);
    if (!fileCheck.ok) { setError(fileCheck.reason!); return; }

    const rateCheck = RateLimiter.check();
    if (!rateCheck.ok) { setError(rateCheck.reason!); setShowUpgrade(true); return; }

    const left = RateLimiter.consume();
    setRemaining(left);
    setItems([]);
    setIdentifiedCount(0);
    setPhase("analyzing");
    setProgress("Scanning your fit...");
    setExpandedItem(null);
    setShowUpgrade(false);

    revokePreviewUrl();

    let working: File;
    try {
      working = await normalizeImageFileForWeb(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare this image.");
      setPhase("idle");
      setProgress("");
      return;
    }

    let previewUrl: string;
    try {
      previewUrl = URL.createObjectURL(working);
    } catch {
      setError("Could not create a preview for this file.");
      setPhase("idle");
      setProgress("");
      return;
    }
    previewBlobUrlRef.current = previewUrl;
    setImage(previewUrl);

    try {
      const base64 = await fileToBase64(working);
      const mediaType = working.type || "image/jpeg";
      const { items: identified, analysisRunId } = await identifyOutfit(base64, mediaType);
      setIdentifiedCount(identified.length);
      setItems(identified.map((it) => ({ ...it })));
      setProgress(`${identified.length} pieces found — shopping...`);
      setPhase("searching");

      for (let i = 0; i < identified.length; i++) {
        setProgress(`Finding ${identified[i].category.toLowerCase()} (${i + 1}/${identified.length})`);
        const product = await searchProduct(identified[i], analysisRunId || undefined);
        setItems((prev) => prev.map((entry, idx) => (idx === i ? { ...entry, product } : entry)));
      }

      setPhase("done");
      setProgress("");
    } catch (err) {
      console.error(err);
      setPhase("idle");
      setIdentifiedCount(0);
      setProgress("Couldn't analyze — try another photo.");
    }
  }, [revokePreviewUrl]);

  const reset = (): void => {
    revokePreviewUrl();
    setImage(null);
    setItems([]);
    setIdentifiedCount(0);
    setPhase("idle");
    setProgress("");
    setExpandedItem(null);
    setError("");
    setShowUpgrade(false);
    setRemaining(RateLimiter.remaining());
    if (fileRef.current) fileRef.current.value = "";
  };

  const total = items.reduce((sum, it) => {
    if (it.product?.price) {
      const p = it.product.price.replace(/[^0-9.]/g, "");
      const n = parseFloat(p);
      if (!isNaN(n) && n > 0) return sum + n;
    }
    // Fall back to Gemini's price_estimate — take the lower bound of any range
    if (it.price_estimate) {
      const nums = it.price_estimate.match(/\d+(\.\d+)?/g);
      if (nums) return sum + parseFloat(nums[0]);
    }
    return sum;
  }, 0);

  const handleShopClick = (item: OutfitItem): void => {
    trackClick(item, item.product?.url || "direct");
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>): void => {
    handleFile(e.target.files?.[0]);
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(1200px 700px at 8% -10%, rgba(209,163,139,.22), transparent 58%), radial-gradient(900px 520px at 94% 8%, rgba(118,136,255,.12), transparent 48%), #07070a",
        color: "#f1ede7",
        fontFamily: "'Outfit','Helvetica Neue',sans-serif",
        WebkitFontSmoothing: "antialiased",
        overflowX: "hidden",
      }}
    >
      <FitFindStyles />

      <div className="ff-shell">

        <FitFindNav
          user={user}
          isAdmin={isAdmin}
          remaining={remaining}
          limit={RateLimiter.LIMIT}
          showReset={phase === "done"}
          onReset={reset}
          onSignOut={handleSignOut}
        />

        {!user && <FitFindAuthWall />}

        {user && !image && (
          <FitFindUploadState
            isAdmin={false}
            adminSummary={null}
            adminSummaryError=""
            dragOver={dragOver}
            fileRef={fileRef}
            error={error}
            showUpgrade={showUpgrade}
            onDragOver={handleDragOver}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onOpenPicker={() => fileRef.current?.click()}
            onFileInput={handleFileInput}
          />
        )}

        {user && image && (
          <FitFindResultsState
            image={image}
            phase={phase}
            identifiedCount={identifiedCount}
            items={items}
            total={total}
            progress={progress}
            expandedItem={expandedItem}
            timelineRef={timelineRef}
            resultsAnchorRef={resultsAnchorRef}
            onToggleExpanded={(idx) => setExpandedItem(expandedItem === idx ? null : idx)}
            onShopClick={handleShopClick}
          />
        )}
      </div>
    </div>
  );
}