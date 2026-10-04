import { Shell } from "@/components/shell";
import { Recouvrements } from "@/components/operations";

export default function Page() {
  return (
    <Shell perm={["RECOUVREMENT_CONSULTER", "RECOUVREMENT_VALIDER"]}>
      <Recouvrements />
    </Shell>
  );
}
