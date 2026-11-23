export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <section className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Access not available</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Your account does not currently have permission to open a dashboard or inventory workspace.
          Please contact your ERP administrator to review your role and business-unit assignment.
        </p>
        <a href="/login" className="mt-6 inline-flex rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
          Return to sign in
        </a>
      </section>
    </main>
  );
}
