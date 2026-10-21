import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { postingStore } from "@/app/container";
import type { MachineNeeds } from "@/features/postings/types/recommendation";
import type { BrazilianRegion } from "@/shared/lib/brazil";
import { questions } from "../types/machineFinder";

type Answers = Omit<MachineNeeds, "application" | "state"> & {
  application: MachineNeeds["application"] | null;
  region: BrazilianRegion | null;
  state: MachineNeeds["state"] | null;
};
const emptyAnswers: Answers = { application: null, soil: "unknown", region: null, state: null, startDate: null, endDate: null };

export function useMachineFinder() {
  const [answers, setAnswers] = useState(emptyAnswers);
  const [responses, setResponses] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const search = useMutation({ mutationFn: (needs: MachineNeeds) => postingStore.recommend(needs), retry: false });

  function request(next: Answers) {
    if (next.application && next.state) search.mutate({
      application: next.application, soil: next.soil, state: next.state,
      startDate: next.startDate, endDate: next.endDate,
    });
  }

  function answer(patch: Partial<Answers>, text: string) {
    if (step >= questions.length) return;
    const next = { ...answers, ...patch };
    if (patch.region && patch.region !== answers.region) next.state = null;
    setAnswers(next);
    setResponses([...responses.slice(0, step), text]);
    setStep(step + 1);
    if (step === questions.length - 1) request(next);
  }

  function back() {
    search.reset();
    setStep(Math.max(0, step - 1));
    setResponses(responses.slice(0, Math.max(0, step - 1)));
  }

  function restart() {
    // Detach any in-flight result so it cannot replace the restarted chat.
    search.reset();
    setAnswers(emptyAnswers);
    setResponses([]);
    setStep(0);
  }

  return { answers, responses, step, answer, back, restart, search, retry: () => request(answers) };
}
