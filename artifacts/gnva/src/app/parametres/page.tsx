import { Shell } from "@/components/shell";
import { Parametres } from "@/components/modules";

export default function Page() {
  return (
    <Shell perm={["PARAMETRE_MODIFIER"]}>
      <Parametres />
    </Shell>
  );
}
