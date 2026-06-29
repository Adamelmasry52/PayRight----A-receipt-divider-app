import { RouterProvider, Routes } from "./router.tsx";
import { BillProvider } from "./context/BillContext.tsx";
import { StartScreen } from "./features/start/StartScreen.tsx";
import { ReviewScreen } from "./features/review/ReviewScreen.tsx";
import { PeopleScreen } from "./features/people/PeopleScreen.tsx";
import { AssignScreen } from "./features/assign/AssignScreen.tsx";
import { SummaryScreen } from "./features/summary/SummaryScreen.tsx";

export default function App() {
  return (
    <BillProvider>
      <RouterProvider>
        <Routes
          routes={[
            { path: "/", element: <StartScreen /> },
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
