import { Shell } from "@/components/shell";
import { Verification } from "@/components/tools";

export default function Page() {
  return (
    <Shell perm={["ASSUJETTI_CONSULTER"]}>
      <Verification />
    </Shell>
  );
}
