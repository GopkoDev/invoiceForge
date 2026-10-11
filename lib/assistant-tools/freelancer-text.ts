// Freelancer-entered text marking (AC-19b): shared by every channel that answers from the read tools.

export type FreelancerText = { freelancerText: string };

export function freelancerText(text: string): FreelancerText {
  return { freelancerText: text };
}

export function nullableFreelancerText(text: string | null | undefined): FreelancerText | null {
  return text === null || text === undefined ? null : freelancerText(text);
}
