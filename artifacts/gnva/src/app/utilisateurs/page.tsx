import { Shell } from "@/components/shell";
import { Utilisateurs } from "@/components/modules";

export default function Page() {
  return (
    <Shell perm={["UTILISATEUR_CREER","UTILISATEUR_MODIFIER","UTILISATEUR_SUSPENDRE"]}>
      <Utilisateurs />
    </Shell>
  );
}
