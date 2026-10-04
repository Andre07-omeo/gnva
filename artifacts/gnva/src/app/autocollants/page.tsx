import { Shell } from "@/components/shell";
import { Autocollants } from "@/components/operations";

export default function Page() {
  return (
    <Shell perm={["AUTOCOLLANT_CONSULTER"]}>
      <Autocollants />
    </Shell>
  );
}
