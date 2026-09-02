CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE role_type AS ENUM ('locador', 'locatario', 'operador', 'admin');
CREATE TYPE credential_type AS ENUM ('cnh', 'certificado');
CREATE TYPE credential_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE ad_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE rental_status AS ENUM ('pending', 'active', 'completed', 'cancelled');
CREATE TYPE contract_status AS ENUM ('pending_signatures', 'signed', 'cancelled');

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    document VARCHAR(20) UNIQUE NOT NULL, 
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role role_type NOT NULL,
    city VARCHAR(100),
    state VARCHAR(2),
    status VARCHAR(50) DEFAULT 'active',
    -- Operador cadastrado de dentro do painel pertence a quem o criou.
    employer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_employer_id ON users(employer_id);

-- Credentials
CREATE TABLE credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type credential_type NOT NULL,
    document_number VARCHAR(50),
    expiration_date DATE,
    file_url VARCHAR(1024),
    status credential_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_credentials_user_id ON credentials(user_id);

-- Machines (Referenced as 'machines' below)
CREATE TABLE machines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    renagro_number VARCHAR(100) UNIQUE,
    brand VARCHAR(100),
    model VARCHAR(100),
    year INTEGER,
    technical_specifications TEXT,
    usage_purpose VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Postings
CREATE TABLE postings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    machinery_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE, -- Fixed table name
    hourly_rate DECIMAL(10, 2) NOT NULL,
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    location_cep VARCHAR(8),
    location_address TEXT,
    availability_start TIMESTAMP WITH TIME ZONE,
    availability_end TIMESTAMP WITH TIME ZONE,
    description TEXT,
    status ad_status DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Moderação de anúncios (RF17): histórico de aprovações e reprovações.
CREATE TABLE posting_moderations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    posting_id UUID NOT NULL REFERENCES postings(id) ON DELETE CASCADE,
    moderator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(20) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Postings Photos
CREATE TABLE postings_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    postings_id UUID NOT NULL REFERENCES postings(id) ON DELETE CASCADE,
    image_url VARCHAR(1024) NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ad_photos_ad_id ON postings_photos(postings_id);

-- Rentals
CREATE TABLE rentals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    postings_id UUID NOT NULL REFERENCES postings(id), -- Fixed table name typo (postingss -> postings)
    lessee_id UUID NOT NULL REFERENCES users(id),
    operator_id UUID REFERENCES users(id),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_price DECIMAL(10, 2),
    initial_hour_meter INTEGER,
    final_hour_meter INTEGER,
    status rental_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Contracts
CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rental_id UUID UNIQUE NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    document_url VARCHAR(1024),
    accepted_by_lessor BOOLEAN DEFAULT false,
    accepted_by_lessee BOOLEAN DEFAULT false,
    status contract_status DEFAULT 'pending_signatures',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Contract Signatures
-- Evidencia da assinatura eletronica simples (MP 2.200-2/2001, art. 10, par. 2,
-- e Lei 14.063/2020). Tabela append-only: as triggers abaixo impedem UPDATE e
-- DELETE, e cada linha encadeia o hash da anterior (previous_hash/record_hash),
-- de modo que qualquer adulteracao quebre a cadeia de forma detectavel.
CREATE TABLE contract_signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES contracts(id),
    signer_id UUID REFERENCES users(id),
    signer_name VARCHAR(255) NOT NULL DEFAULT '',
    signer_email VARCHAR(255) NOT NULL DEFAULT '',
    role VARCHAR(20) NOT NULL,
    document_version VARCHAR(20) NOT NULL DEFAULT '',
    document_hash VARCHAR(64) NOT NULL,
    hash_algorithm VARCHAR(20) NOT NULL DEFAULT 'sha256',
    signed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address VARCHAR(64) NOT NULL DEFAULT '',
    user_agent VARCHAR(1024) NOT NULL DEFAULT '',
    otp_verified BOOLEAN NOT NULL DEFAULT false,
    previous_hash VARCHAR(64) NOT NULL,
    record_hash VARCHAR(64) NOT NULL UNIQUE
);

CREATE INDEX idx_contract_signatures_contract ON contract_signatures(contract_id, signed_at);

CREATE OR REPLACE FUNCTION contract_signatures_append_only()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'contract_signatures e append-only: registros de assinatura nao podem ser alterados ou removidos';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contract_signatures_no_update
    BEFORE UPDATE ON contract_signatures
    FOR EACH ROW EXECUTE FUNCTION contract_signatures_append_only();

CREATE TRIGGER contract_signatures_no_delete
    BEFORE DELETE ON contract_signatures
    FOR EACH ROW EXECUTE FUNCTION contract_signatures_append_only();

-- Contract Signature OTPs
-- Codigo de uso unico enviado por e-mail antes do aceite, para provar posse do
-- endereco. Guardamos apenas o hash do codigo, salgado com o id do contrato.
CREATE TABLE contract_signature_otps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    code_hash VARCHAR(64) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contract_signature_otps_lookup
    ON contract_signature_otps(contract_id, role, created_at DESC);

-- Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES users(id),
    receiver_id UUID NOT NULL REFERENCES users(id),
    -- Uma thread e derivada: ou pertence a uma locacao, ou e uma consulta sobre
    -- um anuncio feita antes de existir locacao. Exatamente um dos dois.
    rental_id UUID REFERENCES rentals(id) ON DELETE CASCADE,
    posting_id UUID REFERENCES postings(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP WITH TIME ZONE,
    hidden_at TIMESTAMP WITH TIME ZONE,
    client_id UUID,
    flagged_for_moderation BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT messages_exactly_one_scope CHECK (
        (rental_id IS NOT NULL AND posting_id IS NULL)
     OR (rental_id IS NULL AND posting_id IS NOT NULL)
    )
);
-- Idempotencia de envio: reenvio com o mesmo client_id nao duplica a linha.
CREATE UNIQUE INDEX messages_sender_client_id_uniq ON messages (sender_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_messages_rental_thread   ON messages (rental_id, sent_at DESC, id DESC);
CREATE INDEX idx_messages_posting_thread  ON messages (posting_id, sent_at DESC, id DESC);
CREATE INDEX idx_messages_sender_recent   ON messages (sender_id, sent_at DESC);
CREATE INDEX idx_messages_receiver_recent ON messages (receiver_id, sent_at DESC);
CREATE INDEX idx_messages_unread          ON messages (receiver_id) WHERE read_at IS NULL;
CREATE INDEX idx_messages_flagged         ON messages (sent_at DESC) WHERE flagged_for_moderation;

-- Denuncias de mensagens + decisao da moderacao na mesma linha.
CREATE TABLE message_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    reported_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    resolution VARCHAR(20),
    resolution_note TEXT,
    resolved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (message_id, reported_by_id)
);
CREATE INDEX idx_message_reports_pending ON message_reports (created_at DESC) WHERE resolution IS NULL;

-- Reviews
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id),
    reviewee_id UUID NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(rental_id, reviewer_id)
);