import { useRef, useState } from "react";
import { Film, ArrowUpRight } from "lucide-react";
import { callVideoEmbed } from "./callVideoEmbed";
import {
  callUrl,
  type CallMedia,
} from "../../../supabase/functions/_shared/callFunnels";

function nativeCallVideo(url: string) {
  if (!url || !callUrl(url)) return false;
  try {
    return /\.(mp4|webm|ogv|ogg|m4v)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export default function CallVideo({
  media,
  title,
  preview = false,
  chapters = [],
  position = 0,
  onPosition,
  captions = "",
}: {
  media: CallMedia;
  title: string;
  preview?: boolean;
  chapters?: { id: string; title: string; seconds: number }[];
  position?: number;
  onPosition?: (seconds: number) => void;
  captions?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState(0);
  const [resumeAt] = useState(position);
  const [resumed, setResumed] = useState(false);
  const native = nativeCallVideo(media.url);
  const embed = callVideoEmbed(media.url);
  const valid = !!media.url && callUrl(media.url);
  const poster =
    !!media.poster && callUrl(media.poster, true) ? media.poster : undefined;
  function seek(seconds: number) {
    if (
      !ref.current ||
      !Number.isFinite(ref.current.duration) ||
      ref.current.duration <= 0
    )
      return;
    ref.current.currentTime = Math.min(
      seconds,
      Math.max(0, ref.current.duration - 0.1),
    );
    setCurrent(Math.floor(ref.current.currentTime));
    setResumed(true);
    ref.current.focus();
  }
  const timestamp = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  return (
    <div className="cf-media-group">
      <div className="cf-media">
        {!preview && !failed && native ? (
          <video
            ref={ref}
            src={media.url}
            poster={poster}
            controls
            playsInline
            preload="metadata"
            crossOrigin={captions ? "anonymous" : undefined}
            aria-label={title}
            onLoadedMetadata={() => setReady(true)}
            onError={() => setFailed(true)}
            onTimeUpdate={() => {
              const seconds = Math.floor(ref.current?.currentTime || 0);
              if (seconds !== current) {
                setCurrent(seconds);
                onPosition?.(seconds);
              }
            }}
          >
            {captions && callUrl(captions) && (
              <track
                kind="captions"
                src={captions}
                srcLang="en"
                label="English captions"
                default
              />
            )}
          </video>
        ) : !preview && embed ? (
          <iframe
            title={title}
            src={embed}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="fullscreen; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            allowFullScreen
          />
        ) : (
          <div
            className="cf-media-placeholder"
            style={
              poster
                ? {
                    backgroundImage: `linear-gradient(0deg,rgba(7,14,25,.88),rgba(7,14,25,.45)),url("${poster.replace(/["\\]/g, "")}")`,
                  }
                : undefined
            }
          >
            <span className="cf-play-mark" aria-hidden="true">
              <Film size={30} />
            </span>
            <p>
              {preview
                ? `${title} preview`
                : valid
                  ? failed
                    ? "The video could not load."
                    : title
                  : "Video coming soon"}
            </p>
            {preview ? (
              <small>Video playback is available on the published page.</small>
            ) : valid ? (
              <small>Use the original video link below.</small>
            ) : (
              <small>You can continue below.</small>
            )}
          </div>
        )}
      </div>
      {!preview && valid && (
        <a
          className="cf-original-video cf-small"
          href={media.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open original video <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      )}
      {!preview && native && !failed && (
        <>
          {!resumed && resumeAt > 0 && (
            <button
              type="button"
              className="cf-text-button"
              disabled={!ready}
              onClick={() => seek(resumeAt)}
            >
              Resume at {timestamp(resumeAt)}
            </button>
          )}
          {chapters.length > 0 && (
            <nav className="cf-chapters" aria-label="Video chapters">
              {chapters.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  disabled={!ready}
                  onClick={() => seek(c.seconds)}
                >
                  <span>{timestamp(c.seconds)}</span>
                  {c.title}
                </button>
              ))}
            </nav>
          )}
          {onPosition && (
            <p className="cf-small cf-muted">
              Playback position: {timestamp(current)}. Saved in this tab; this
              is not an attendance record.
            </p>
          )}
        </>
      )}
      {chapters.length > 0 && (!native || preview) && (
        <div className="cf-chapter-outline">
          <p className="cf-small cf-muted">Training outline</p>
          <ol>
            {chapters.map((c) => (
              <li key={c.id}>
                <span>{timestamp(c.seconds)}</span> {c.title}
              </li>
            ))}
          </ol>
        </div>
      )}
      {media.transcript && (
        <details className="cf-transcript">
          <summary>Read the video transcript</summary>
          <div>{media.transcript}</div>
        </details>
      )}
    </div>
  );
}
