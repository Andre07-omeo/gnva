import { Shell } from "@/components/shell";
import { Assujettis } from "@/components/assujettis";

export default function Page() {
  return (
    <Shell perm={["ASSUJETTI_CONSULTER"]}>
      <Assujettis />
    </Shell>
  );
}
