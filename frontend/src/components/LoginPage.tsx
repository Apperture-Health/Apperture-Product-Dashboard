"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";

type LoginPageProps = {
  onLogin: (username: string, password: string) => Promise<void>;
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onLogin(username, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("401") || message.toLowerCase().includes("invalid")) {
        setError("Incorrect username or password. Please try again.");
      } else if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
        setError("Cannot reach the server. Please ensure the backend is running.");
      } else {
        setError(message || "Sign-in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel-left">
        <div className="login-brand">
          <Image src="/assets/logos/APP_logo1.png" alt="Apperture" width={52} height={52} priority />
          <h1 className="login-headline">Clinical Trials<br />Intelligence Platform</h1>
          <p className="login-tagline">Clinical intelligence for faster, smarter decisions.</p>
        </div>
        <ul className="login-features">
          <li><span className="lf-icon">📈</span><span>Pipeline &amp; competitive landscape analysis</span></li>
          <li><span className="lf-icon">💊</span><span>Drug pricing &amp; market access insights</span></li>
          <li><span className="lf-icon">🎯</span><span>Endpoint benchmarking &amp; PRO analytics</span></li>
          <li><span className="lf-icon">🛡️</span><span>Adverse event &amp; safety profiling</span></li>
          <li><span className="lf-icon">💬</span><span>AI-powered natural language queries</span></li>
        </ul>
        <div className="login-footer-note">Powered by Apperture · v1.0.0</div>
      </div>

      <div className="login-panel-right">
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form-header">
            <h2>Welcome back</h2>
            <p>Sign in to your account to continue</p>
          </div>

          <div className="login-field">
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </div>

          {error ? (
            <div className="login-error-box">
              <span>⚠️</span> {error}
            </div>
          ) : null}

          <button type="submit" className="login-submit" disabled={loading || !username || !password}>
            {loading ? "Signing in…" : "Sign in →"}
          </button>

          <div className="login-disclaimer">
            Access is restricted to authorised users only.
          </div>
        </form>
      </div>
    </div>
  );
}
