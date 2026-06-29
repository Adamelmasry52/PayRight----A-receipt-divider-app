import type { ReactNode } from "react";

/*
  Mobile-first app frame. Constrains content to a phone-width column, centers it
  on larger screens, and reserves iOS safe-area padding. Every screen renders
  inside this shell.
*/
export function AppShell({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] w-full bg-surface-0 text-text">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col">
        <main
          className="flex-1 px-4 pb-6"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}
        >
          {children}
        </main>
        {footer ? (
          <footer
            className="sticky bottom-0 border-t border-white/5 bg-surface-1/80 px-4 py-3 backdrop-blur"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
