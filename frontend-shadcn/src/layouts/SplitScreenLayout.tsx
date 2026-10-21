import { LogoDevelopedBy } from '@/components/LogoDevelopedBy';
import { useIsMobile } from '@/hooks/useMediaQuery';

// Served from /public (not imported) so index.html can preload it: it's the LCP
// element of the login and public questionnaire pages, and an imported asset is only
// discovered after the JS bundle runs. WebP, with a 400px variant for small screens
// (shown at ~200px on phones): 19 KB / 33 KB vs 108 KB for the original PNG.
// Keep SURVEY_HUB_LOGO_SRCSET/SIZES in sync with the preload in index.html, or the
// browser downloads the image twice.
const SURVEY_HUB_LOGO = '/EUonQoLSurveyHub_logo.webp';
const SURVEY_HUB_LOGO_SRCSET =
  '/EUonQoLSurveyHub_logo-400.webp 400w, /EUonQoLSurveyHub_logo.webp 597w';
// Mobile layout: max 50% of the screen; 601–767px: full-width pane (max 650px);
// md+: 2/5 pane (max 650px).
const SURVEY_HUB_LOGO_SIZES =
  '(max-width: 600px) 50vw, (max-width: 767px) min(100vw, 650px), min(40vw, 650px)';

/**
 * Shell a due pannelli condivisa da `PublicLayout` (questionario pubblico) e
 * `AuthLayout` (login/auth): logo SurveyHub a sinistra + `LogoDevelopedBy` in
 * fondo, contenuto a destra.
 */
export function SplitScreenLayout({ children }: { children: React.ReactNode }) {
  // Reactive (unlike a one-off matchMedia read): the layout must follow resize and
  // browser zoom, which shrinks the CSS viewport (WCAG 1.4.10 reflow).
  const isMobile = useIsMobile(600);

  if (isMobile) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-around px-2">
        <div className="flex flex-col items-center w-full">
          <header className="w-full flex flex-col items-center">
            <div className="w-full flex justify-center items-end min-h-[130px] mt-2 mb-2">
              <img
                src={SURVEY_HUB_LOGO}
                srcSet={SURVEY_HUB_LOGO_SRCSET}
                sizes={SURVEY_HUB_LOGO_SIZES}
                alt="EUonQoL Survey Hub"
                width={597}
                height={597}
                fetchPriority="high"
                className="max-w-[50%] object-contain"
              />
            </div>
            <div
              aria-hidden="true"
              className="w-[80%] h-[0.5px] bg-[#222] mx-auto my-2 rounded-[1px]"
            />
          </header>
          <main className="w-full flex flex-col items-center justify-center gap-8 max-w-[320px] py-[18px] mt-[18px]">
            {children}
          </main>
        </div>
        <footer>
          <LogoDevelopedBy />
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex">
      {/* Branding pane — a landmark, so no content sits outside one (axe `region`). */}
      <header className="w-full md:w-2/5 bg-white flex flex-col items-center justify-center relative overflow-hidden">
        <div className="flex-1 w-full flex items-center justify-center">
          <div className="text-left w-full max-w-[650px] px-4 z-1">
            <img
              src={SURVEY_HUB_LOGO}
              srcSet={SURVEY_HUB_LOGO_SRCSET}
              sizes={SURVEY_HUB_LOGO_SIZES}
              alt="EUonQoL Survey Hub"
              width={597}
              height={597}
              fetchPriority="high"
              className="w-full opacity-95"
            />
          </div>
        </div>

        <div className="pb-6">
          <LogoDevelopedBy />
        </div>
      </header>

      <main className="w-full md:w-3/5 flex flex-col items-center justify-center gap-8 bg-[#F9F9F9]">
        {children}
      </main>
    </div>
  );
}
