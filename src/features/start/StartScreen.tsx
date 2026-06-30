import { Camera, PencilSimple, Receipt } from "@phosphor-icons/react";
import { useBill } from "../../context/BillContext.tsx";
import { useRouter } from "../../router.tsx";
import { AppShell } from "../../components/AppShell.tsx";
import { Button } from "../../components/ui/Button.tsx";

export function StartScreen() {
  const { reset, addItem } = useBill();
  const { navigate } = useRouter();

  const startManual = () => {
    reset();
    addItem(); // begin with one blank row
    navigate("/review");
  };

  return (
    <AppShell>
      <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
        <div className="grid size-16 place-items-center rounded-card bg-success text-surface-0">
          <Receipt weight="fill" size={36} />
        </div>
        <h1 className="mt-5 text-3xl">PayRight</h1>
        <p className="mt-2 max-w-xs text-text-secondary">
          Split a restaurant bill fairly — tax and service shared the right way.
        </p>

        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          <Button variant="primary" onClick={startManual} className="w-full">
            <PencilSimple weight="bold" size={20} />
            Enter manually
          </Button>

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => navigate("/capture")}
          >
            <Camera weight="fill" size={20} />
            Scan receipt
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
