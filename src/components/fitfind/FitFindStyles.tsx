"use client";

import { JSX } from "react";

export function FitFindStyles(): JSX.Element {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600;700;800&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap"
        rel="stylesheet"
      />
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{
          --ff-bg:#07070a;
          --ff-surface:rgba(255,255,255,.03);
          --ff-surface-strong:rgba(255,255,255,.05);
          --ff-stroke:rgba(255,255,255,.10);
          --ff-stroke-soft:rgba(255,255,255,.06);
          --ff-text:#f1ede7;
          --ff-muted:#9e958c;
          --ff-accent:#d1a38b;
          --ff-accent-2:#b8806a;
        }
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes scanMove{0%{top:-2px}100%{top:calc(100% + 2px)}}
        @keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}
        @keyframes dotPulse{0%,80%,100%{transform:scale(0);opacity:.5}40%{transform:scale(1);opacity:1}}
        @keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        .card-enter{animation:fadeUp .45s cubic-bezier(.22,1,.36,1) both}
        .scan-line{animation:scanMove 1.8s ease-in-out infinite alternate}
        .breathe{animation:breathe 3s ease-in-out infinite}
        .shop-btn{transition:all .2s cubic-bezier(.22,1,.36,1);-webkit-tap-highlight-color:transparent;touch-action:manipulation}
        .shop-btn:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(209,163,139,.35)}
        .shop-btn:active{transform:scale(.97)}
        .upload-zone{transition:all .3s;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
        .upload-zone:active{transform:scale(.985)}
        .item-row{transition:all .2s;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
        .item-row:active{background:#1a1a1e!important}
        .dot-loading span{display:inline-block;width:5px;height:5px;border-radius:50%;background:#d1a38b;animation:dotPulse 1.4s ease-in-out infinite}
        .dot-loading span:nth-child(2){animation-delay:.2s}
        .dot-loading span:nth-child(3){animation-delay:.4s}
        input[type="file"]{display:none}
        @media(hover:hover){.item-row:hover{background:#151518!important}}
        .upgrade-card{position:relative;overflow:hidden}
        .upgrade-card::before{content:'';position:absolute;top:0;left:-100%;width:60%;height:100%;background:linear-gradient(90deg,transparent,rgba(209,163,139,.06),transparent);animation:shimmer 3s ease-in-out infinite}
        .fitfind-email{display:none}
        @media(min-width:380px){.fitfind-email{display:inline-block!important}}
        .ff-shell{
          position:relative;
          isolation:isolate;
          width:100%;
          max-width:560px;
          margin:0 auto;
          padding:0 16px env(safe-area-inset-bottom, 20px);
        }
        .ff-shell::before{
          content:'';
          position:fixed;
          inset:0;
          pointer-events:none;
          background-image:radial-gradient(rgba(255,255,255,.035) 1px, transparent 1px);
          background-size:3px 3px;
          opacity:.2;
          z-index:-2;
        }
        .ff-nav{
          backdrop-filter:blur(14px);
          -webkit-backdrop-filter:blur(14px);
          border-bottom:1px solid rgba(255,255,255,.06);
        }
        .ff-panel{
          background:linear-gradient(165deg, rgba(255,255,255,.045), rgba(255,255,255,.015));
          border:1px solid rgba(255,255,255,.08);
          box-shadow:0 26px 80px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.06);
          border-radius:24px;
        }
        .ff-tag{
          font-size:11px;
          letter-spacing:.06em;
          text-transform:uppercase;
          color:var(--ff-muted);
          padding:6px 11px;
          border-radius:999px;
          border:1px solid var(--ff-stroke-soft);
          background:rgba(255,255,255,.02);
        }
        .results-hero{
          position:relative;
          overflow:hidden;
          border-radius:22px;
          border:1px solid rgba(255,255,255,.09);
          background:rgba(255,255,255,.02);
        }
        .results-overlay{
          position:absolute;
          inset:auto 0 0 0;
          padding:16px 14px;
          background:linear-gradient(180deg, rgba(10,10,12,0) 0%, rgba(10,10,12,.8) 100%);
          display:flex;
          gap:8px;
          flex-wrap:wrap;
        }
        .timeline-shell{
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:8px;
          margin:14px 0;
        }
        .timeline-step{
          border:1px solid rgba(255,255,255,.08);
          border-radius:12px;
          padding:10px;
          background:rgba(255,255,255,.02);
          transform:translateY(0);
          transition:transform .24s ease, border-color .24s ease, background .24s ease, opacity .24s ease;
        }
        .timeline-step.active{
          border-color:rgba(209,163,139,.42);
          background:rgba(209,163,139,.09);
          transform:translateY(-2px);
        }
        .timeline-step.done{
          border-color:rgba(52,211,153,.3);
          background:rgba(52,211,153,.1);
        }
        .result-item{
          border:1px solid rgba(255,255,255,.1);
          border-radius:16px;
          background:linear-gradient(165deg, rgba(255,255,255,.05), rgba(255,255,255,.02));
          padding:14px;
          margin-bottom:10px;
          animation:fadeUp .35s cubic-bezier(.22,1,.36,1) both;
          transition:border-color .22s ease, background .22s ease, transform .22s ease;
        }
        .result-item.pending{
          opacity:.78;
        }
        .result-item.resolved{
          border-color:rgba(209,163,139,.22);
          background:linear-gradient(165deg, rgba(255,255,255,.06), rgba(255,255,255,.025));
        }
        .skeleton-line{
          position:relative;
          overflow:hidden;
        }
        .skeleton-line::after{
          content:'';
          position:absolute;
          inset:0;
          background:linear-gradient(90deg, transparent, rgba(255,255,255,.15), transparent);
          transform:translateX(-100%);
          animation:shimmer 1.9s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}
