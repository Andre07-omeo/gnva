import { Shell } from "@/components/shell";
import { Rapports } from "@/components/dashboard";

export default function Page() {
  return (
    <Shell perm={["RAPPORT_CONSULTER"]}>
      <Rapports />
    </Shell>
  );
}
