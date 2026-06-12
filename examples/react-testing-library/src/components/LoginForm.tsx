import { useState } from "react";

interface LoginFormProps {
  onSubmit: (email: string, password: string) => void;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit() {
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    setError("");
    onSubmit(email, password);
  }

  return (
    <form>
      <label>
        Email
        <input value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label>
        Password
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" onClick={submit}>
        Sign in
      </button>
    </form>
  );
}
