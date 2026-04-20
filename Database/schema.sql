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
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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
    location_address TEXT,
    availability_start TIMESTAMP WITH TIME ZONE,
    availability_end TIMESTAMP WITH TIME ZONE,
    description TEXT,
    status ad_status DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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

-- Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES users(id),
    receiver_id UUID NOT NULL REFERENCES users(id),
    rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    flagged_for_moderation BOOLEAN DEFAULT false
);
CREATE INDEX idx_messages_rental_id ON messages(rental_id);

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