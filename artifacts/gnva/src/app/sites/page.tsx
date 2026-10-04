import { Shell } from "@/components/shell";
import { Sites } from "@/components/modules";

export default function Page() {
  return (
    <Shell perm={["SITE_GERER"]}>
      <Sites />
    </Shell>
  );
}
