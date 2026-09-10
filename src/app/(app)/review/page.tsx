"use client";

import { useRouter } from "next/navigation";
import { EveningReview } from "@/components/review/evening-review";

export default function ReviewPage() {
  const router = useRouter();
  return (
    <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
      <EveningReview onFinish={() => router.push("/")} />
    </div>
  );
}
