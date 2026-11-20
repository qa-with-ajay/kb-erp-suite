"use client";

interface Props {
  fileName: string;
  className?: string;
}

/** Browser-native "Save as PDF": opens the print dialog with the document title set as the suggested filename. */
export function InvoicePDF({ fileName, className = "" }: Props) {
  const handleClick = () => {
    const previous = document.title;
    document.title = fileName;
    const restore = () => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 ${className}`}
    >
      Save as PDF
    </button>
  );
}
