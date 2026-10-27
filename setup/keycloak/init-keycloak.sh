#!/bin/sh

echo "========================================"
echo "Keycloak TEST - Init Script"
echo "========================================"

# Attendi che Keycloak sia disponibile
echo "Waiting for Keycloak..."
sleep 30

MAX_RETRIES=30
RETRY=0

while [ $RETRY -lt $MAX_RETRIES ]; do
    if curl -s -o /dev/null -w "%{http_code}" http://keycloak:$KEYCLOAK_PORT/realms/master | grep -q "200"; then
        echo "Keycloak is ready!"
        break
    fi
    RETRY=$((RETRY + 1))
    echo "Waiting... attempt $RETRY/$MAX_RETRIES"
    sleep 5
done

if [ $RETRY -eq $MAX_RETRIES ]; then
    echo "ERROR: Keycloak not ready after $MAX_RETRIES attempts"
    exit 1
fi

sleep 10

echo "Starting Keycloak configuration via REST API..."

# Ottieni token admin.
#
# Il token del realm master dura 60 secondi. Le fasi qui sotto restano sotto
# quel limite su un database locale, ma non su uno remoto, dove ogni chiamata
# admin e' una scrittura con round trip di rete: il token scade a meta' script
# e le chiamate successive tornano 401 in silenzio (curl non fallisce, e gli
# ID estratti dalle risposte restano vuoti). Per questo il token viene
# ri-acquisito all'inizio di ogni fase invece che una volta sola.
get_admin_token() {
    TOKEN_RESPONSE=$(curl -s -X POST "http://keycloak:$KEYCLOAK_PORT/realms/master/protocol/openid-connect/token" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "username=$KEYCLOAK_ADMIN" \
      -d "password=$KEYCLOAK_ADMIN_PASSWORD" \
      -d "grant_type=password" \
      -d "client_id=admin-cli")
    ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
    if [ -z "$ACCESS_TOKEN" ]; then
        echo "ERROR: Could not get access token"
        exit 1
    fi
}

echo "Getting admin token..."
get_admin_token
echo "✓ Got admin token"

# ============================================
# CONFIGURA SSL PER REALM MASTER
# ============================================
echo "Configuring SSL requirement for master realm..."
curl -s -X PUT "http://keycloak:$KEYCLOAK_PORT/admin/realms/master" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sslRequired": "none"
  }'

echo "✓ Master realm configured for HTTP"

# ============================================
# CONFIGURA CLIENT security-admin-console (master realm)
# ============================================
echo "Configuring security-admin-console client (master realm)..."

ADMIN_CONSOLE_UUID=$(curl -s -X GET "http://keycloak:$KEYCLOAK_PORT/admin/realms/master/clients?clientId=security-admin-console" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -n "$ADMIN_CONSOLE_UUID" ]; then
  curl -s -X PUT "http://keycloak:$KEYCLOAK_PORT/admin/realms/master/clients/$ADMIN_CONSOLE_UUID" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"redirectUris\": [\"$KEYCLOAK_URL_PUBLIC/admin/master/console/*\", \"/admin/master/console/*\"],
      \"webOrigins\": [\"+\"]
    }"
  echo "✓ security-admin-console redirectUris/webOrigins configured"
else
  echo "WARNING: security-admin-console client not found in master realm"
fi

configure_realm_events() {
  TARGET_REALM="$1"
  echo "Configuring events for realm: $TARGET_REALM"

  curl -s -X PUT "http://keycloak:$KEYCLOAK_PORT/admin/realms/$TARGET_REALM" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "eventsEnabled": true,
      "eventsExpiration": 7776000,
      "enabledEventTypes": ["LOGIN","LOGOUT","LOGIN_ERROR","LOGOUT_ERROR"],
      "eventsListeners": ["jboss-logging"]
    }' > /dev/null

  echo "✓ Events configured for realm: $TARGET_REALM"
}

# Verifica se il realm esiste già
echo "Checking if realm $REALM_NAME exists..."
REALM_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME")

if [ "$REALM_CHECK" = "200" ]; then
    configure_realm_events "$REALM_NAME"
    echo "========================================="
    echo "✓ Realm $REALM_NAME already exists"
    echo "Configuration already present in database"
    echo "Skipping initialization"
    echo "========================================="
    exit 0
fi

echo "Realm does not exist - starting full initialization..."

# ============================================
# CREA REALM
# ============================================
echo "Creating realm: $REALM_NAME"
curl -s -X POST "http://keycloak:$KEYCLOAK_PORT/admin/realms" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"$REALM_ID\",
    \"realm\": \"$REALM_NAME\",
    \"enabled\": true,
    \"sslRequired\": \"none\",
    \"registrationAllowed\": true,
    \"resetPasswordAllowed\": true,
    \"rememberMe\": true,
    \"loginWithEmailAllowed\": true,
    \"eventsEnabled\": true,
    \"eventsExpiration\": 7776000,
    \"enabledEventTypes\": [\"LOGIN\",\"LOGOUT\",\"LOGIN_ERROR\",\"LOGOUT_ERROR\"],
    \"eventsListeners\": [\"jboss-logging\"],
    \"smtpServer\": {
      \"host\": \"$EMAIL_HOST\",
      \"port\": \"$EMAIL_PORT\",
      \"from\": \"$EMAIL_FROM\",
      \"fromDisplayName\": \"$EMAIL_FROM_DISPLAY_NAME\",
      \"auth\": true,
      \"starttls\": true,
      \"ssl\": false,
      \"user\": \"$EMAIL_USER\",
      \"password\": \"$EMAIL_PASSWORD\"
    }
  }"

echo "\n✓ Realm created"

# ============================================
# CONFIGURA USER PROFILE
# ============================================
get_admin_token
echo "Configuring User Profile..."

curl -s -X PUT "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/users/profile" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": [
      {
        "name": "username",
        "displayName": "${username}",
        "validations": {
          "length": {"min": 3, "max": 255},
          "username-prohibited-characters": {},
          "up-username-not-idn-homograph": {}
        },
        "permissions": {"view": ["admin", "user"], "edit": ["admin", "user"]},
        "multivalued": false
      },
      {
        "name": "email",
        "displayName": "${email}",
        "validations": {"email": {}, "length": {"max": 255}},
        "required": {"roles": ["user"]},
        "permissions": {"view": ["admin", "user"], "edit": ["admin", "user"]},
        "multivalued": false
      },
      {
        "name": "firstName",
        "displayName": "${firstName}",
        "validations": {"length": {"max": 255}, "person-name-prohibited-characters": {}},
        "required": {"roles": ["user"]},
        "permissions": {"view": ["admin", "user"], "edit": ["admin", "user"]},
        "multivalued": false
      },
      {
        "name": "lastName",
        "displayName": "${lastName}",
        "validations": {"length": {"max": 255}, "person-name-prohibited-characters": {}},
        "required": {"roles": ["user"]},
        "permissions": {"view": ["admin", "user"], "edit": ["admin", "user"]},
        "multivalued": false
      },
      {
        "name": "user_type",
        "displayName": "User Type",
        "validations": {
          "length": {"max": 255},
          "options": {
            "options": ["admin", "manager"]
          }
        },
        "annotations": {
          "inputType": "select",
          "inputOptionsFromValidation": "options"
        },
        "permissions": {"view": ["admin", "user"], "edit": ["admin"]},
        "multivalued": false
      },
      {
        "name": "is_active",
        "displayName": "Is Active",
        "validations": {
          "options": {
            "options": ["true", "false"]
          }
        },
        "annotations": {
          "inputType": "select",
          "inputOptionsFromValidation": "options"
        },
        "permissions": {"view": ["admin", "user"], "edit": ["admin"]},
        "multivalued": false
      }
    ],
    "groups": [
      {
        "name": "user-metadata",
        "displayHeader": "User metadata",
        "displayDescription": "Attributes, which refer to user metadata"
      }
    ]
  }'

echo "✓ User Profile configured"

# ============================================
# CREA CLIENT SCOPE
# ============================================
get_admin_token
echo "Creating client scope..."

curl -s -X POST "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/client-scopes" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"user-attributes\",
    \"protocol\": \"openid-connect\",
    \"attributes\": {
      \"include.in.token.scope\": \"true\",
      \"display.on.consent.screen\": \"true\"
    }
  }"

SCOPE_ID=$(curl -s -X GET "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/client-scopes" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | grep -o '"id":"[^"]*","name":"user-attributes"' | grep -o '"id":"[^"]*' | cut -d'"' -f4)

echo "✓ Client scope created (ID: $SCOPE_ID)"

# ============================================
# CREA MAPPERS
# ============================================
get_admin_token
echo "Creating protocol mappers..."

curl -s -X POST "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/client-scopes/$SCOPE_ID/protocol-mappers/models" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"user_type\",
    \"protocol\": \"openid-connect\",
    \"protocolMapper\": \"oidc-usermodel-attribute-mapper\",
    \"config\": {
      \"user.attribute\": \"user_type\",
      \"claim.name\": \"user_type\",
      \"jsonType.label\": \"String\",
      \"id.token.claim\": \"true\",
      \"access.token.claim\": \"true\",
      \"userinfo.token.claim\": \"true\"
    }
  }"

curl -s -X POST "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/client-scopes/$SCOPE_ID/protocol-mappers/models" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"is_active\",
    \"protocol\": \"openid-connect\",
    \"protocolMapper\": \"oidc-usermodel-attribute-mapper\",
    \"config\": {
      \"user.attribute\": \"is_active\",
      \"claim.name\": \"is_active\",
      \"jsonType.label\": \"String\",
      \"id.token.claim\": \"true\",
      \"access.token.claim\": \"true\",
      \"userinfo.token.claim\": \"true\"
    }
  }"

echo "✓ Mappers created"

# ============================================
# CREA FRONTEND CLIENT
# ============================================
get_admin_token
echo "Creating frontend client..."

curl -s -X POST "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/clients" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"clientId\": \"$FRONTEND_CLIENT_ID\",
    \"enabled\": true,
    \"publicClient\": true,
    \"directAccessGrantsEnabled\": true,
    \"standardFlowEnabled\": true,
    \"implicitFlowEnabled\": false,
    \"redirectUris\": [\"$FRONTEND_REDIRECT_URIS\"],
    \"webOrigins\": [\"$FRONTEND_WEB_ORIGINS\"],
    \"protocol\": \"openid-connect\",
    \"attributes\": {
      \"pkce.code.challenge.method\": \"S256\"
    }
  }"

FRONTEND_CLIENT_UUID=$(curl -s -X GET "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/clients" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | grep -o "\"id\":\"[^\"]*\",\"clientId\":\"$FRONTEND_CLIENT_ID\"" | grep -o "\"id\":\"[^\"]*" | cut -d'"' -f4)

curl -s -X PUT "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/clients/$FRONTEND_CLIENT_UUID/default-client-scopes/$SCOPE_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

echo "✓ Frontend client created"

# ============================================
# AGGIUNGE AUDIENCE MAPPER (backend deve comparire in aud)
# ============================================
get_admin_token
echo "Adding audience mapper for backend client..."

curl -s -X POST "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/clients/$FRONTEND_CLIENT_UUID/protocol-mappers/models" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"backend-audience\",
    \"protocol\": \"openid-connect\",
    \"protocolMapper\": \"oidc-audience-mapper\",
    \"config\": {
      \"included.client.audience\": \"$BACKEND_CLIENT_ID\",
      \"id.token.claim\": \"false\",
      \"access.token.claim\": \"true\"
    }
  }"

echo "✓ Audience mapper added"

# ============================================
# CREA BACKEND CLIENT
# ============================================
get_admin_token
echo "Creating backend client..."

curl -s -X POST "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/clients" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"clientId\": \"$BACKEND_CLIENT_ID\",
    \"enabled\": true,
    \"publicClient\": false,
    \"secret\": \"$BACKEND_CLIENT_SECRET\",
    \"serviceAccountsEnabled\": true,
    \"directAccessGrantsEnabled\": false,
    \"standardFlowEnabled\": false,
    \"protocol\": \"openid-connect\"
  }"

echo "✓ Backend client created"

# ============================================
# ASSEGNA PERMESSI AL BACKEND
# ============================================
get_admin_token
echo "Assigning permissions to backend..."

BACKEND_CLIENT_UUID=$(curl -s -X GET "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/clients" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | grep -o "\"id\":\"[^\"]*\",\"clientId\":\"$BACKEND_CLIENT_ID\"" | grep -o "\"id\":\"[^\"]*" | cut -d'"' -f4)

SERVICE_ACCOUNT_ID=$(curl -s -X GET "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/clients/$BACKEND_CLIENT_UUID/service-account-user" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

REALM_MGMT_UUID=$(curl -s -X GET "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/clients" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | grep -o "\"id\":\"[^\"]*\",\"clientId\":\"realm-management\"" | grep -o "\"id\":\"[^\"]*" | cut -d'"' -f4)

MANAGE_USERS_ROLE=$(curl -s -X GET "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/clients/$REALM_MGMT_UUID/roles/manage-users" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

VIEW_USERS_ROLE=$(curl -s -X GET "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/clients/$REALM_MGMT_UUID/roles/view-users" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

curl -s -X POST "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/users/$SERVICE_ACCOUNT_ID/role-mappings/clients/$REALM_MGMT_UUID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "[$MANAGE_USERS_ROLE,$VIEW_USERS_ROLE]"

echo "✓ Backend permissions assigned"

# ============================================
# CREA UTENTI
# ============================================
create_user() {
    USERNAME=$1
    EMAIL=$2
    PASSWORD=$3
    FIRSTNAME=$4
    LASTNAME=$5
    USER_TYPE=$6
    IS_ACTIVE=$7

    echo "Creating user: $USERNAME"

    get_admin_token

    curl -s -X POST "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/users" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"username\": \"$USERNAME\",
        \"email\": \"$EMAIL\",
        \"firstName\": \"$FIRSTNAME\",
        \"lastName\": \"$LASTNAME\",
        \"enabled\": true,
        \"emailVerified\": true,
        \"requiredActions\": [\"UPDATE_PASSWORD\"],
        \"attributes\": {
          \"user_type\": [\"$USER_TYPE\"],
          \"is_active\": [\"$IS_ACTIVE\"]
        }
      }"

    USER_ID=$(curl -s -X GET "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/users?username=$USERNAME" \
      -H "Authorization: Bearer $ACCESS_TOKEN" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

    # Imposta la password
    curl -s -X PUT "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/users/$USER_ID/reset-password" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"type\": \"password\",
        \"value\": \"$PASSWORD\",
        \"temporary\": false
      }"

    # Imposta la required action UPDATE_PASSWORD
    curl -s -X PUT "http://keycloak:$KEYCLOAK_PORT/admin/realms/$REALM_NAME/users/$USER_ID" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"requiredActions\": [\"UPDATE_PASSWORD\"]
      }"

    echo "✓ User $USERNAME created"
}

echo "Creating test users..."
create_user "$ADMIN_USERNAME" "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "$ADMIN_FIRSTNAME" "$ADMIN_LASTNAME" "$ADMIN_TYPE" "$ADMIN_IS_ACTIVE"

# ============================================
# RIEPILOGO
# ============================================
echo "\n========================================"
echo "✓ TEST Environment Setup Complete!"
echo "========================================"
echo "Realm: $REALM_NAME"
echo "Keycloak: http://localhost:$KEYCLOAK_PORT"
echo "Admin Console: http://localhost:$KEYCLOAK_PORT/admin"
echo ""
echo "Frontend Client: $FRONTEND_CLIENT_ID"
echo "Backend Client: $BACKEND_CLIENT_ID"
echo "Backend Secret: $BACKEND_CLIENT_SECRET"
echo ""
echo "Test Users Created:"
echo "  1. $ADMIN_USERNAME / $ADMIN_PASSWORD ($ADMIN_TYPE)"
echo ""
echo "Mailpit: http://localhost:$EMAIL_PORT"
echo "========================================"
