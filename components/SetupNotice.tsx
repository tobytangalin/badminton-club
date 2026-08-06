export function SetupNotice() {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
      <h2 className="mb-2 text-lg font-semibold">Firebase not configured</h2>
      <p>
        Copy <code className="rounded bg-amber-100 px-1">.env.example</code> to{" "}
        <code className="rounded bg-amber-100 px-1">.env.local</code>, fill in your
        Firebase web app config, then restart <code className="rounded bg-amber-100 px-1">npm run dev</code>.
      </p>
    </div>
  );
}
