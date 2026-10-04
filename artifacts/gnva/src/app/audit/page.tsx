import { Shell } from "@/components/shell";
import { Audit } from "@/components/modules";

export default function Page() {
  return (
    <Shell perm={["AUDIT_CONSULTER"]}>
      <Audit />
    </Shell>
  );
}
