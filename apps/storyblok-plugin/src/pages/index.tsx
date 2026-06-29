import Head from "next/head";
import ContentGuardPanel from "@/components/ContentGuardPanel";
import { useAppBridge, useAutoHeight } from "@/hooks";

export default function Home() {
  useAutoHeight();

  // Keep tool iframe in mocked mode for now so content is always visible in Storyblok.
  const { completed } = useAppBridge({ oauth: false, type: "tool-plugin" });

  return (
    <>
      <Head>
        <title>Content Guard</title>
        <meta name="description" content="Content Guard Storyblok tool plugin" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f4fbf7_0%,_#f8f8f2_45%,_#ffffff_100%)] text-zinc-900">
        {!completed && (
          <p className="mx-auto mb-3 w-full max-w-4xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            App Bridge auth is still initializing. Showing mocked audit results in fallback mode.
          </p>
        )}
        <ContentGuardPanel />
      </main>
    </>
  );
}
