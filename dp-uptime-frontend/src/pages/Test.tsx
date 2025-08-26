import { useState } from "react";
import bs58 from "bs58";

export default function SecretKeyConverter() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConvert = () => {
    try {
      if (!input.trim()) {
        setError("Please enter a secret key");
        return;
      }
      const decoded = bs58.decode(input.trim());
      setOutput(JSON.stringify([...decoded]));
      setError(null);
    } catch (e: any) {
      setError("Invalid secret key format. Please provide a valid base58 key.");
      setOutput(null);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-10 p-6 bg-white shadow-lg rounded-2xl">
      <h2 className="text-xl font-bold mb-4">Solana Secret Key Converter</h2>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste your base58 secret key here"
        className="w-full p-3 border rounded-lg mb-4"
        rows={3}
      />

      <button
        onClick={handleConvert}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
      >
        Convert to Array
      </button>

      {error && <p className="text-red-500 mt-3">{error}</p>}

      {output && (
        <div className="mt-4">
          <h3 className="font-semibold mb-2">Array Format:</h3>
          <pre className="bg-gray-100 p-3 rounded-lg overflow-x-auto">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
