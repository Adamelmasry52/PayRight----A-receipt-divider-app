import { useState } from "react";
import { RouterProvider, Routes } from "./router.tsx";
import { BillProvider } from "./context/BillContext.tsx";
import { SHARE_FRAGMENT_PREFIX } from "./core/index.ts";
import { StartScreen } from "./features/start/StartScreen.tsx";
import { CaptureScreen } from "./features/capture/CaptureScreen.tsx";
import { ReviewScreen } from "./features/review/ReviewScreen.tsx";
import { PeopleScreen } from "./features/people/PeopleScreen.tsx";
import { AssignScreen } from "./features/assign/AssignScreen.tsx";
import { SummaryScreen } from "./features/summary/SummaryScreen.tsx";
import { SharedBillScreen } from "./features/share/SharedBillScreen.tsx";

export default function App() {
  // A shared link carries the bill in the fragment (#d=...). Detected once at
  // mount — opening a link is a fresh load — and renders the read-only view,
  // bypassing the normal editable flow.
  const [sharedFragment] = useState(() => {
    const hash = window.location.hash.replace(/^#/, "");
    return hash.startsWith(SHARE_FRAGMENT_PREFIX) ? hash : null;
  });

  if (sharedFragment) return <SharedBillScreen fragment={sharedFragment} />;

  return (
    <BillProvider>
      <RouterProvider>
        <Routes
          routes={[
            { path: "/", element: <StartScreen /> },
            { path: "/capture", element: <CaptureScreen /> },
            { path: "/review", element: <ReviewScreen /> },
            { path: "/people", element: <PeopleScreen /> },
            { path: "/assign", element: <AssignScreen /> },
            { path: "/summary", element: <SummaryScreen /> },
            { path: "*", element: <StartScreen /> },
          ]}
        />
      </RouterProvider>
    </BillProvider>
  );
}
