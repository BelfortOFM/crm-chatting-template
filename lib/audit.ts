import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Journalise une action sensible (paie, remuneration, cycle de vie d'un
 * compte). Volontairement silencieuse en cas d'echec : un probleme d'ecriture
 * du journal ne doit jamais empecher l'action metier elle-meme d'aboutir.
 *
 * Le nom de l'auteur est copie dans la ligne : le journal doit rester lisible
 * meme si le profil correspondant disparait plus tard.
 */
export async function logAction(
  supabase: SupabaseClient,
  params: {
    agencyId: string;
    actorId: string;
    actorName: string;
    action: string;
    targetLabel?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await supabase.from("audit_log").insert({
      agency_id: params.agencyId,
      actor_id: params.actorId,
      actor_name: params.actorName,
      action: params.action,
      target_label: params.targetLabel ?? null,
      details: params.details ?? null,
    });
  } catch {
    // Ignore volontairement.
  }
}

/** Libelles lisibles des actions journalisees, pour l'ecran d'historique. */
export const ACTION_LABELS: Record<string, string> = {
  "chatter.create": "Création d'un chatter",
  "chatter.deactivate": "Désactivation d'un chatter",
  "chatter.reactivate": "Réactivation d'un chatter",
  "chatter.rename": "Renommage d'un chatter",
  "chatter.password_reset": "Réinitialisation de mot de passe",
  "commission.update": "Changement de commission",
  "goal.update": "Changement d'objectif",
  "goal.model": "Objectif de période d'un modèle",
  "goal.allocate": "Répartition d'objectif",
  "bonus.add": "Ajout d'un bonus",
  "bonus.delete": "Suppression d'un bonus",
  "sanction.add": "Ajout d'une sanction",
  "sanction.delete": "Suppression d'une sanction",
  "payout.close": "Clôture de paie",
  "payout.reopen": "Réouverture de paie",
  "payroll.rules.apply": "Application des règles de prime/sanction",
  "payroll.rule.create": "Création d'une règle de prime/sanction",
  "payroll.rule.update": "Modification d'une règle de prime/sanction",
  "payroll.rule.toggle": "Activation/désactivation d'une règle",
  "model.assign": "Assignation d'un modèle",
  "model.unassign": "Retrait d'un modèle",
  "team_leader.assign": "Nomination Team Leader",
  "team_leader.unassign": "Retrait du statut Team Leader",
  "warning.add": "Ajout d'un avertissement",
  "warning.delete": "Suppression d'un avertissement",
  "ltv_target.model": "Objectif de LTV fixé",
  "rate.update": "Changement du taux de change",
  "identity.approve": "Identité validée",
  "identity.reject": "Identité refusée",
  "identity.purge": "Pièces d'identité supprimées",
  "identity.waive": "Vérification d'identité levée",
  "identity.require": "Vérification d'identité exigée",
  "ip_watch.create": "IP mise sous surveillance",
  "shift.assign": "Créneau de travail assigné",
  "shift.unassign": "Créneau de travail retiré",
  "dayoff.add": "Jour OFF accordé",
  "dayoff.remove": "Jour OFF annulé",
  "subscribers.record": "Relevé du nombre d'abonnés",
};
