import axios from "axios";

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8080";
const REALM = process.env.KEYCLOAK_REALM || "euonqol";
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || "euonqol-backend";
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || "HE9evcw5s5xoDestvoCMdZKCk+8asQOe"; //openssl rand -base64 24
const FRONTEND_CLIENT_ID = process.env.KEYCLOAK_CLIENT_FRONTEND_ID || "euonqol-frontend";

export interface KeycloakUser {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  emailVerified: boolean;
  enabled: boolean;
  requiredActions?: string[];
  attributes?: Record<string, string[]>;
}

export interface TokenResponse {
  status: "success" | "error";
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  message?: string;
}

/**
 * Ottiene il token admin per chiamate API a Keycloak
 */
export async function getAdminToken(): Promise<string> {
  try {
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
    return response.data.access_token;
  } catch (error: any) {
    console.error("❌ Error authenticating admin:", error.response?.data);
    throw new Error("Unable to authenticate admin");
  }
}

/**
 * ✅ NUOVA FUNZIONE: Verifica credenziali SENZA creare sessione
 * Usa un token temporaneo che viene subito scartato
 */
export async function verifyUserCredentials(
  email: string,
  password: string
): Promise<{ 
  valid: boolean; 
  user?: KeycloakUser; 
  needsPasswordUpdate?: boolean;
  error?: string 
}> {
  try {
    // 1. Tenta di ottenere un token (questo verifica le credenziali)
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: "password",
        client_id: FRONTEND_CLIENT_ID!,
        username: email,
        password: password,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const tempAccessToken = response.data.access_token;
    const tempRefreshToken = response.data.refresh_token;

    // 2. ✅ IMPORTANTE: Revoca immediatamente il token per chiudere la sessione
    try {
      await axios.post(
        `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/logout`,
        new URLSearchParams({
          client_id: FRONTEND_CLIENT_ID!,
          refresh_token: tempRefreshToken,
        }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );
    } catch (logoutError) {
      console.warn('⚠️ Error during temporary session revocation:', logoutError);
    }

    // 3. Recupera info utente
    const user = await getKeycloakUserByEmail(email);

    if (!user) {
      return { valid: false, error: "Invalid credentials or user not found" };
    }

    // devo verificare usando il formato stringa perché il valore è "false" e non booleano
    if(user.attributes?.is_active.toString() === "false") {
      return { valid: false, error: "Invalid credentials or user not found" };
    }

    // 4. Controlla se serve aggiornamento password
    const needsPasswordUpdate = user.requiredActions?.includes("UPDATE_PASSWORD");

    return { 
      valid: true, 
      user, 
      needsPasswordUpdate 
    };
  } catch (error: any) {
    console.log('❌ Error during credentials check:', error);
    const errorData = error.response?.data;

    // Gestisci required actions (es. UPDATE_PASSWORD)
    if (errorData?.error === "invalid_grant") {
      const desc = errorData.error_description?.toLowerCase() || "";

      if (
        desc.includes("not fully set up") ||
        desc.includes("account disabled temporarily") ||
        desc.includes("update password")
      ) {
        // Recupera comunque l'utente per vedere le required actions
        const user = await getKeycloakUserByEmail(email);
        if (user) {
          return { 
            valid: true, 
            user, 
            needsPasswordUpdate: true 
          };
        }
      }
    }

    console.error("❌ Keycloak credential verification error:", errorData);
    return {
      valid: false,
      error: "Invalid credentials or user not found",
    };
  }
}

/**
 * ✅ Login completo (da usare SOLO dopo verifica OTP)
 */
export async function loginUserWithKeycloak(
  email: string,
  password: string
): Promise<{ success: boolean; tokens?: TokenResponse; error?: string }> {
  try {
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: "password",
        client_id: FRONTEND_CLIENT_ID!,
        username: email,
        password: password,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    return { 
      success: true, 
      tokens: response.data 
    };
  } catch (error: any) {
    console.error("❌ Keycloak login error:", error.response?.data);
    return {
      success: false,
      error: "Login failed",
    };
  }
}

/**
 * Trova un utente Keycloak tramite email
 */
export async function getKeycloakUserByEmail(
  email: string
): Promise<KeycloakUser | null> {
  try {
    const adminToken = await getAdminToken();
    const response = await axios.get(
      `${KEYCLOAK_URL}/admin/realms/${REALM}/users`,
      {
        params: { email, exact: true },
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    if (response.data.length === 0) {
      return null;
    }

    return response.data[0];
  } catch (error: any) {
    console.error(
      "❌ Error get user:",
      error.response?.data || error.message
    );
    return null;
  }
}

/**
 * Autentica un utente con Keycloak (verifica credenziali)
 */
export async function authenticateUserWithKeycloak(
  email: string,
  password: string
): Promise<{ success: boolean; user?: KeycloakUser; tokens?: TokenResponse; error?: string }> {
  try {
    // Tenta login diretto con Keycloak
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: "password",
        client_id: FRONTEND_CLIENT_ID!,
        username: email,
        password: password,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    // Login riuscito, recupera info utente
    const user = await getKeycloakUserByEmail(email);

    if (!user) {
      return { success: false, error: "User not found" };
    }

    const tokens = response.data;

    return { success: true, user, tokens };
  } catch (error: any) {
    const errorData = error.response?.data;

    // Gestisci required actions (es. UPDATE_PASSWORD)
    if (errorData?.error === "invalid_grant") {
      const desc = errorData.error_description?.toLowerCase() || "";

      if (
        desc.includes("not fully set up") ||
        desc.includes("account disabled temporarily") ||
        desc.includes("update password")
      ) {
        // Recupera comunque l'utente per vedere le required actions
        const user = await getKeycloakUserByEmail(email);
        if (user) {
          return { success: true, user };
        }
      }
    }

    console.error("❌ Keycloak auth error:", errorData);
    return {
      success: false,
      error: "Invalid credentials",
    };
  }
}

/**
 * Aggiorna la password di un utente in Keycloak
 */
export async function updateUserPassword(
  userId: string,
  newPassword: string
): Promise<void> {
  const adminToken = await getAdminToken();

  await axios.put(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/users/${userId}/reset-password`,
    {
      type: "password",
      value: newPassword,
      temporary: false,
    },
    {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
    }
  );
}

/**
 * Rimuove una required action da un utente
 */
export async function removeRequiredAction(
  userId: string,
  action: string
): Promise<void> {
  const adminToken = await getAdminToken();

  // Recupera utente corrente
  const userResponse = await axios.get(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/users/${userId}`,
    {
      headers: { Authorization: `Bearer ${adminToken}` },
    }
  );

  const user = userResponse.data;
  const requiredActions =
    user.requiredActions?.filter((a: string) => a !== action) || [];

  // Aggiorna utente
  await axios.put(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/users/${userId}`,
    { requiredActions },
    {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
    }
  );
}

/**
 * Logout utente (revoca refresh token)
 */
export const logoutUser = async (refreshToken: string) => {
  await axios.post(
    `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/logout`,
    new URLSearchParams({
      client_id: FRONTEND_CLIENT_ID!,
      refresh_token: refreshToken,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
};

/**
 * Token introspection - Verifica validità token
 */
export const introspectToken = async (accessToken: string) => {
  const response = await axios.post(
    `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token/introspect`,
    new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      token: accessToken,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  return response.data;
};

/**
 * Refresh access token
 */
export const refreshAccessToken = async (refreshToken: string) => {
  const response = await axios.post(
    `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: FRONTEND_CLIENT_ID!,
      refresh_token: refreshToken,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  return response.data;
};

/**
 * Genera URL per SSO logout completo
 */
export const getSSOLogoutUrl = (redirectUri: string = 'http://localhost:3000/login') => {
  return `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/logout?redirect_uri=${encodeURIComponent(redirectUri)}`;
};