import { Shell } from "@/components/shell";
import { Geographies } from "@/components/modules";

export default function Page() {
  return (
    <Shell perm={["GEOGRAPHIE_GERER"]}>
      <Geographies />
    </Shell>
  );
}
