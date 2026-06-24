import { useCallback, useState } from "react";

interface UploadDropzoneProps {
  fileName?: string;
  onFile(file: File): void;
}

export function UploadDropzone({ fileName, onFile }: UploadDropzoneProps) {
  const [dragging, setDragging] = useState(false);

  const acceptFile = useCallback(
    (file?: File) => {
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <section
      className={`dropzone ${fileName ? "dropzone-compact" : "dropzone-empty"} ${
        dragging ? "is-dragging" : ""
      }`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        acceptFile(event.dataTransfer.files[0]);
      }}
    >
      <div>
        {fileName ? (
          <>
            <p className="eyebrow">Current PDF</p>
            <h1>{fileName}</h1>
            <p className="subtitle">Drop another PDF here to replace it.</p>
          </>
        ) : (
          <>
            <p className="eyebrow">2-up PDF Slide Splitter</p>
            <h1>Drop a PDF handout</h1>
            <p className="subtitle">
              Automatically split PowerPoint-style two-slide handouts into one clean slide
              per page.
            </p>
          </>
        )}
      </div>
      <label className="file-button">
        {fileName ? "Replace PDF" : "Choose PDF"}
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => acceptFile(event.target.files?.[0])}
        />
      </label>
      {!fileName && (
        <p className="privacy-line">
          Files are processed locally in your browser. This is not a redaction tool.
        </p>
      )}
    </section>
  );
}
