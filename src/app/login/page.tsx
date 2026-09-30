import { LoginForm } from "./login-form";
import "./login.css";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <h1 id="login-title">מערכת פיננסית</h1>
        <LoginForm />
      </section>
    </main>
  );
}
