import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4">
      {/* Gym background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "url('https://images.squarespace-cdn.com/content/v1/64fc0161bc537d4f094715eb/a9dbfaf7-19b1-4fc1-bcc6-7a1e223432f6/DSC08829.jpg')",
          filter: "brightness(0.35) saturate(0.5)",
        }}
      />
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/m2logo.png" alt="M2 Performance and Therapy" className="h-20 mx-auto mb-5" />
          <p className="text-[10px] font-semibold uppercase tracking-[3px] text-blue-400 mb-2">
            M2 Performance &amp; Therapy
          </p>
          <h1 className="text-3xl font-bold">M2 Scheduler</h1>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
