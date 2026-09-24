import { useAuth } from "@/contexts/AuthContext";
import ChangePassword from "./ChangePassword";
import SignOutOtherDevices from "./SignOutOtherDevices";

/** /admin/settings — password and session controls for the signed-in admin. */
const AccountSecurity = () => {
  const { user } = useAuth();
  return (
    <div
      className="admin-page-stack"
      style={{ maxWidth: 760, marginInline: 0 }}
    >
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Settings</p>
          <h1>Account security</h1>
          {user?.email && <p>Signed in as {user.email}</p>}
        </div>
      </header>
      <section className="admin-card admin-section">
        <ChangePassword />
      </section>
      <section className="admin-card admin-section">
        <SignOutOtherDevices />
      </section>
    </div>
  );
};

export default AccountSecurity;
