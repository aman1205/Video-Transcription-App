import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";
import axios from "axios";
import "./VideoUploader.css";

const MAX_BYTES = 250 * 1024 * 1024; // 250 MB
const ASSEMBLYAI_KEY = import.meta.env.VITE_ASSEMBLYAI_API_KEY;

export default function VideoUploader() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [downloadURL, setDownloadURL] = useState("");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");

  const onDrop = useCallback((acceptedFiles, fileRejections) => {
    setError("");
    if (fileRejections && fileRejections.length) {
      const msg = fileRejections[0].errors.map((e) => e.message).join(", ");
      setError(msg);
      return;
    }
    const f = acceptedFiles[0];
    if (f.size > MAX_BYTES) {
      setError("File exceeds 250MB limit.");
      return;
    }
    setFile(f);
    setTranscript("");
    setDownloadURL("");
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "video/*": [] },
    maxSize: MAX_BYTES,
    multiple: false,
  });

  const startUpload = async () => {
    if (!file) return setError("No file selected.");
    setUploading(true);
    setProgress(0);
    setTranscript("");
    setDownloadURL("");

    try {
      const storageRef = ref(storage, `uploads/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const pct = Math.floor(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          setProgress(pct);
        },
        (err) => {
          setError("Upload failed: " + err.message);
          setUploading(false);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          setDownloadURL(url);

          try {
            const createResp = await axios.post(
              "https://api.assemblyai.com/v2/transcript",
              { audio_url: url },
              {
                headers: {
                  authorization: ASSEMBLYAI_KEY,
                  "content-type": "application/json",
                },
              }
            );

            const transcriptId = createResp.data.id;

            let finished = null;
            const start = Date.now();
            while (true) {
              const r = await axios.get(
                `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
                {
                  headers: { authorization: ASSEMBLYAI_KEY },
                }
              );
              const status = r.data.status;
              if (status === "completed") {
                finished = r.data;
                break;
              }
              if (status === "error")
                throw new Error(r.data.error || "Transcription error");
              if (Date.now() - start > 5 * 60 * 1000)
                throw new Error("Transcription timed out");
              await new Promise((resolve) => setTimeout(resolve, 2000));
            }
            setTranscript(finished.text || "");
          } catch (err) {
            setError(
              "Transcription failed: " +
                (err.response?.data?.error || err.message)
            );
          } finally {
            setUploading(false);
          }
        }
      );
    } catch (err) {
      setError(err.message || "Unexpected error");
      setUploading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>🎥 Video Transcription Uploader</h2>

      <div
        {...getRootProps()}
        style={{
          ...styles.dropzone,
          borderColor: isDragActive ? "#6B21A8" : "#aaa",
          backgroundColor: isDragActive ? "#f5f0ff" : "#fff",
        }}
      >
        <input {...getInputProps()} />
        <p>
          {isDragActive
            ? "Drop the video here ..."
            : "Drag & drop a video here, or click to select"}
        </p>
        <small>Max size: 250 MB. Video files only.</small>
      </div>

      {file && (
        <div style={styles.selectedFile}>
          Selected: {file.name} — {(file.size / (1024 * 1024)).toFixed(2)} MB
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.buttonWrapper}>
        <button
          onClick={startUpload}
          disabled={!file || uploading}
          style={(uploading || !file) ? styles.buttonDisabled : styles.button}
        >
          {uploading ? "Uploading..." : "Upload & Transcribe"}
        </button>
      </div>

      {uploading && (
        <div style={styles.progressWrapper}>
          <div style={styles.progressBarBackground}>
            <div style={{ ...styles.progressBarFill, width: `${progress}%` }} />
          </div>
          <div style={styles.progressText}>
            <div className="loader" style={styles.loader}></div> Processing
            video... {progress}%
          </div>
        </div>
      )}

      {downloadURL && (
        <div style={styles.downloadURL}>
          <strong>File URL:</strong>{" "}
          <a
            href={downloadURL}
            target="_blank"
            rel="noreferrer"
            style={styles.link}
          >
            Open
          </a>
        </div>
      )}

      {transcript && (
        <div style={styles.transcriptBox}>
          <h3 style={styles.transcriptTitle}>Transcript</h3>
          <pre style={styles.transcriptText}>{transcript}</pre>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    margin: "30px auto",
    padding: 20,
    borderRadius: 12,
    backgroundColor: "#fff",
    boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
    fontFamily: "Arial, sans-serif",
  },
  title: {
    textAlign: "center",
    color: "#6B21A8",
    marginBottom: 20,
  },
  dropzone: {
    border: "2px dashed #aaa",
    borderRadius: 12,
    padding: 40,
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.3s ease",
  },
  selectedFile: {
    marginTop: 12,
    fontWeight: "bold",
    color: "#333",
  },
  error: {
    marginTop: 8,
    color: "red",
    fontWeight: "bold",
  },
  buttonWrapper: {
    marginTop: 16,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#6B21A8",
    color: "#fff",
    border: "none",
    padding: "10px 20px",
    fontSize: 16,
    borderRadius: 8,
    cursor: "pointer",
    transition: "all 0.3s ease",
    opacity: 1,
  },
  buttonDisabled: {
    backgroundColor: "#6B21A8",
    color: "#fff",
    border: "none",
    padding: "10px 20px",
    fontSize: 16,
    borderRadius: 8,
    opacity: 0.6,
    cursor: "not-allowed",
  },
  progressWrapper: {
    marginTop: 16,
  },
  progressBarBackground: {
    width: "100%",
    height: 8,
    backgroundColor: "#eee",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 8,
    backgroundColor: "#6B21A8",
    transition: "width 0.4s ease",
  },
  progressText: {
    marginTop: 8,
    display: "flex",
    alignItems: "center",
    fontWeight: "bold",
    color: "#333",
  },
  // Loader styles moved to VideoUploader.css
  downloadURL: {
    marginTop: 16,
    textAlign: "center",
  },
  link: {
    color: "#6B21A8",
    textDecoration: "underline",
  },
  transcriptBox: {
    marginTop: 20,
    backgroundColor: "#f7f7f7",
    padding: 12,
    borderRadius: 8,
    borderLeft: "4px solid #6B21A8",
  },
  transcriptTitle: {
    color: "#6B21A8",
    marginBottom: 6,
  },
  transcriptText: {
    whiteSpace: "pre-wrap",
    color: "#333",
    fontSize: 14,
    lineHeight: 1.5,
    wordSpacing: "3px",
  },
};
