# Referência — `features/documents` no front-end

Implementação **completa e copiável** da feature de documentos, espelhando o módulo piloto do
back-end. Substitui `services/OperatorDocumentService/` (253 linhas, metade duplicada) e reduz
`CNHUpload.tsx` (974 linhas, 30 `useState`).

Usa apenas pacotes **já instalados**: `zod`, `react-hook-form`, `@hookform/resolvers`, `axios`.

---

## Camada 1 — `domain/`

**Sem import de `react` nem de `axios`.**

### `domain/errors.ts`

```ts
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class DocumentNotFound extends DomainError {
  constructor(cause?: unknown) {
    super("document_not_found", "Documento não encontrado.", 404, cause);
  }
}

export class InvalidDocumentData extends DomainError {
  constructor(readonly fields?: Record<string, string[]>, cause?: unknown) {
    super("invalid_data", "Dados inválidos.", 400, cause);
  }
}

export class RejectionRequiresNote extends DomainError {
  constructor() {
    super("rejection_requires_note", "O motivo da rejeição é obrigatório.", 400);
  }
}

export class ClassifierUnavailable extends DomainError {
  constructor(cause?: unknown) {
    super("classifier_unavailable", "Serviço de validação indisponível.", 503, cause);
  }
}

export class UnexpectedError extends DomainError {
  constructor(cause?: unknown) {
    super("unexpected", "Erro inesperado.", 500, cause);
  }
}
```

> Erros carregam `code` e `status` — **não** texto de UI pronto. Hoje as classes de erro guardam
> mensagens em português já traduzidas dentro da camada de serviço, e as páginas reinterpretam o
> `AxiosError` mesmo assim (`DashboardLocador.tsx:420-433`).

### `domain/valueObjects.ts`

```ts
import { InvalidDocumentData } from "./errors";

export const ValidationStatus = {
  Pending: "pending",
  Approved: "approved",
  Rejected: "rejected",
} as const;
export type ValidationStatus =
  (typeof ValidationStatus)[keyof typeof ValidationStatus];

export const CnhSituation = {
  Active: "active",
  Expired: "expired",
  Suspended: "suspended",
  Revoked: "revoked",
  Blocked: "blocked",
  Ppd: "ppd",
} as const;
export type CnhSituation = (typeof CnhSituation)[keyof typeof CnhSituation];

export class CPF {
  private constructor(readonly digits: string) {}

  static create(raw: string): CPF {
    const digits = raw.replace(/\D/g, "");
    if (!CPF.isValid(digits)) throw new InvalidDocumentData({ cpf: ["CPF inválido."] });
    return new CPF(digits);
  }

  static isValid(cpf: string): boolean {
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    for (const length of [9, 10]) {
      let total = 0;
      for (let i = 0; i < length; i++) total += Number(cpf[i]) * (length + 1 - i);
      if (((total * 10) % 11) % 10 !== Number(cpf[length])) return false;
    }
    return true;
  }

  masked(): string {
    const d = this.digits;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  toString(): string {
    return this.digits;
  }
}

/** Substitui o split(" – ") / join manual espalhado em CNHUpload.tsx. */
export class BirthPlace {
  static readonly SEPARATOR = " – ";

  constructor(readonly city: string, readonly state: string) {}

  static parse(raw: string): BirthPlace {
    const parts = raw.split(BirthPlace.SEPARATOR);
    return parts.length === 2
      ? new BirthPlace(parts[0].trim(), parts[1].trim())
      : new BirthPlace(raw.trim(), "");
  }

  toString(): string {
    return this.state ? `${this.city}${BirthPlace.SEPARATOR}${this.state}` : this.city;
  }
}
```

### `domain/entities.ts`

```ts
import { RejectionRequiresNote } from "./errors";
import { BirthPlace, CPF, CnhSituation, ValidationStatus } from "./valueObjects";

export abstract class ReviewableDocument {
  constructor(
    readonly id: string,
    readonly userId: string,
    public validationStatus: ValidationStatus = ValidationStatus.Pending,
    public reviewNote: string | null = null,
    public fileUrl: string | null = null,
  ) {}

  get isApproved(): boolean {
    return this.validationStatus === ValidationStatus.Approved;
  }

  get isPending(): boolean {
    return this.validationStatus === ValidationStatus.Pending;
  }

  approve(): void {
    this.validationStatus = ValidationStatus.Approved;
    this.reviewNote = null;
  }

  reject(note: string): void {
    if (!note?.trim()) throw new RejectionRequiresNote();
    this.validationStatus = ValidationStatus.Rejected;
    this.reviewNote = note.trim();
  }
}

export class OperatorLicense extends ReviewableDocument {
  constructor(
    id: string,
    userId: string,
    readonly name: string,
    readonly cpf: CPF,
    readonly cnhNumber: string,
    readonly category: string,
    readonly expirationDate: Date | null,
    readonly situation: CnhSituation,
    readonly points: number,
    readonly birthPlace: BirthPlace,
    validationStatus?: ValidationStatus,
    reviewNote?: string | null,
    fileUrl?: string | null,
  ) {
    super(id, userId, validationStatus, reviewNote, fileUrl);
  }

  isExpired(today: Date = new Date()): boolean {
    return this.expirationDate !== null && this.expirationDate < today;
  }

  get isSuspended(): boolean {
    return (
      this.situation === CnhSituation.Suspended ||
      this.situation === CnhSituation.Revoked ||
      this.situation === CnhSituation.Blocked
    );
  }

  /** A mesma regra do back-end, no mesmo lugar conceitual. */
  enablesOperation(today: Date = new Date()): boolean {
    return this.isApproved && !this.isExpired(today) && !this.isSuspended && this.points < 20;
  }
}

export class Certification extends ReviewableDocument {
  constructor(
    id: string,
    userId: string,
    readonly issuingOrganization: string,
    readonly institution: string,
    readonly title: string,
    readonly issueDate: Date | null,
    readonly expirationDate: Date | null,
    readonly credentialCode: string | null,
    readonly description: string,
    validationStatus?: ValidationStatus,
    reviewNote?: string | null,
    fileUrl?: string | null,
  ) {
    super(id, userId, validationStatus, reviewNote, fileUrl);
  }

  isExpired(today: Date = new Date()): boolean {
    return this.expirationDate !== null && this.expirationDate < today;
  }
}
```

### `domain/repositories.ts`

```ts
import type { Certification, OperatorLicense } from "./entities";
import type { ValidationStatus } from "./valueObjects";

export interface DocumentFilter {
  userId?: string;
  validationStatus?: ValidationStatus;
}

export interface OperatorLicenseRepository {
  findById(id: string): Promise<OperatorLicense>;
  find(filter?: DocumentFilter): Promise<OperatorLicense[]>;
  create(input: CreateLicenseInput): Promise<OperatorLicense>;
  update(id: string, input: Partial<CreateLicenseInput>): Promise<OperatorLicense>;
  remove(id: string): Promise<void>;
  review(id: string, status: ValidationStatus, note?: string): Promise<OperatorLicense>;
}

export interface CertificationRepository {
  findById(id: string): Promise<Certification>;
  find(filter?: DocumentFilter): Promise<Certification[]>;
  create(input: CreateCertificationInput): Promise<Certification>;
  update(id: string, input: Partial<CreateCertificationInput>): Promise<Certification>;
  remove(id: string): Promise<void>;
  review(id: string, status: ValidationStatus, note?: string): Promise<Certification>;
}

export interface DocumentClassifier {
  classify(file: File): Promise<ClassificationResult>;
}

export interface FileUploader {
  upload(file: File): Promise<string>;
}

export interface ClassificationResult {
  isValid: boolean;
  confidence: "high" | "medium" | "low";
  score: number;
}

export type { CreateLicenseInput, CreateCertificationInput } from "../application/dto";
```

---

## Camada 2 — `application/`

### `application/dto.ts`

```ts
import type { CnhSituation } from "../domain/valueObjects";

export interface CreateLicenseInput {
  userId: string;
  name: string;
  birthDate: string;
  cpf: string;
  rg: string;
  motherName: string;
  fatherName?: string;
  nationality: string;
  birthCity: string;
  birthState: string;
  cnhNumber: string;
  category: string;
  firstLicenseDate: string;
  issueDate: string;
  expirationDate: string;
  issuingState: string;
  issuingAuthority: string;
  situation: CnhSituation;
  acc: boolean;
  ear: boolean;
  medicalRestrictions?: string;
  observations?: string;
  points: number;
  fileUrl?: string;
}

export interface CreateCertificationInput {
  userId: string;
  issuingOrganization: string;
  institution: string;
  title: string;
  issueDate: string;
  expirationDate?: string;
  credentialCode?: string;
  description: string;
  fileUrl?: string;
}
```

### `application/useCases/submitLicense.ts`

```ts
import type {
  DocumentClassifier,
  FileUploader,
  OperatorLicenseRepository,
} from "../../domain/repositories";
import type { OperatorLicense } from "../../domain/entities";
import type { CreateLicenseInput } from "../dto";

export class SubmitLicenseUseCase {
  constructor(
    private readonly repository: OperatorLicenseRepository,
    private readonly uploader: FileUploader,
    private readonly classifier: DocumentClassifier,
  ) {}

  async execute(
    input: CreateLicenseInput,
    file?: File,
    existingId?: string,
  ): Promise<OperatorLicense> {
    let fileUrl = input.fileUrl;

    if (file) {
      const result = await this.classifier.classify(file);
      if (!result.isValid) {
        throw new InvalidDocumentData({ file: ["O arquivo não parece ser uma CNH."] });
      }
      fileUrl = await this.uploader.upload(file);
    }

    const payload = { ...input, fileUrl };
    return existingId
      ? this.repository.update(existingId, payload)
      : this.repository.create(payload);
  }
}
```

> A ordem "classifica antes de subir" é uma regra de negócio. Hoje ela está implícita na ordem das
> chamadas dentro de `handleSubmit` (`CNHUpload.tsx:250-329`).

### `application/useCases/reviewDocument.ts`

```ts
import { RejectionRequiresNote } from "../../domain/errors";
import { ValidationStatus } from "../../domain/valueObjects";

export class ReviewDocumentUseCase<T> {
  constructor(
    private readonly repository: {
      review(id: string, s: ValidationStatus, note?: string): Promise<T>;
    },
  ) {}

  async execute(id: string, status: ValidationStatus, note?: string): Promise<T> {
    if (status === ValidationStatus.Rejected && !note?.trim()) {
      throw new RejectionRequiresNote();
    }
    return this.repository.review(id, status, note);
  }
}
```

---

## Camada 3 — `infrastructure/`

### `infrastructure/schemas.ts` — Anti-Corruption Layer

```ts
import { z } from "zod";

/** Valida a resposta da API em runtime, na fronteira. */
export const operatorLicenseApiSchema = z.object({
  id: z.string().uuid(),
  user: z.string().uuid(),
  name: z.string(),
  birth_date: z.string(),
  cpf: z.string(),
  rg: z.string(),
  mother_name: z.string(),
  father_name: z.string().nullable().optional(),
  nationality: z.string(),
  birth_place: z.string(),
  cnh_number: z.string(),
  category: z.string(),
  first_license_date: z.string(),
  issue_date: z.string(),
  expiration_date: z.string(),
  issuing_state: z.string(),
  issuing_authority: z.string(),
  situation: z.enum(["active", "expired", "suspended", "revoked", "blocked", "ppd"]),
  acc: z.boolean(),
  ear: z.boolean(),
  medical_restrictions: z.string().nullable().optional(),
  observations: z.string().nullable().optional(),
  points: z.number(),
  file_url: z.string().nullable().optional(),
  validation_status: z.enum(["pending", "approved", "rejected"]),
  review_note: z.string().nullable().optional(),
});

export const certificationApiSchema = z.object({
  id: z.string().uuid(),
  user: z.string().uuid(),
  issuing_organization: z.string(),
  institution: z.string(),
  title: z.string(),
  issue_date: z.string(),
  expiration_date: z.string().nullable().optional(),
  credential_code: z.string().nullable().optional(),
  description: z.string(),
  media_url: z.string().nullable().optional(),
  validation_status: z.enum(["pending", "approved", "rejected"]),
  review_note: z.string().nullable().optional(),
});

export type OperatorLicenseApi = z.infer<typeof operatorLicenseApiSchema>;
export type CertificationApi = z.infer<typeof certificationApiSchema>;
```

Isto resolve um problema real: hoje `OperatorLicense` é um `type`, apagado na compilação. Se o
back-end renomear um campo, a quebra aparece em produção, não no build.

### `infrastructure/mappers.ts`

```ts
import { Certification, OperatorLicense } from "../domain/entities";
import { BirthPlace, CPF } from "../domain/valueObjects";
import type { CertificationApi, OperatorLicenseApi } from "./schemas";
import type { CreateLicenseInput } from "../application/dto";

const toDate = (v?: string | null): Date | null => (v ? new Date(v) : null);

export const licenseMapper = {
  toEntity(dto: OperatorLicenseApi): OperatorLicense {
    return new OperatorLicense(
      dto.id,
      dto.user,
      dto.name,
      CPF.create(dto.cpf),
      dto.cnh_number,
      dto.category,
      toDate(dto.expiration_date),
      dto.situation,
      dto.points,
      BirthPlace.parse(dto.birth_place),
      dto.validation_status,
      dto.review_note ?? null,
      dto.file_url ?? null,
    );
  },

  toApi(input: CreateLicenseInput): Record<string, unknown> {
    return {
      user: input.userId,
      name: input.name.trim(),
      birth_date: input.birthDate,
      cpf: input.cpf.replace(/\D/g, ""),
      rg: input.rg.replace(/\D/g, ""),
      mother_name: input.motherName,
      father_name: input.fatherName || null,
      nationality: input.nationality,
      birth_place: new BirthPlace(input.birthCity, input.birthState).toString(),
      cnh_number: input.cnhNumber,
      category: input.category,
      first_license_date: input.firstLicenseDate,
      issue_date: input.issueDate,
      expiration_date: input.expirationDate,
      issuing_state: input.issuingState,
      issuing_authority: input.issuingAuthority,
      situation: input.situation,
      acc: input.acc,
      ear: input.ear,
      medical_restrictions: input.medicalRestrictions || null,
      observations: input.observations || null,
      points: input.points,
      file_url: input.fileUrl,
    };
  },
};

export const certificationMapper = {
  toEntity(dto: CertificationApi): Certification {
    return new Certification(
      dto.id,
      dto.user,
      dto.issuing_organization,
      dto.institution,
      dto.title,
      toDate(dto.issue_date),
      toDate(dto.expiration_date),
      dto.credential_code ?? null,
      dto.description,
      dto.validation_status,
      dto.review_note ?? null,
      dto.media_url ?? null,
    );
  },
};
```

O `snake_case` da API morre aqui. Nada além desta camada o enxerga.

### `infrastructure/HttpOperatorLicenseRepository.ts`

```ts
import { AxiosError } from "axios";
import { AxiosInstance } from "@/shared/api/AxiosInstance";

import type { OperatorLicense } from "../domain/entities";
import {
  ClassifierUnavailable,
  DocumentNotFound,
  DomainError,
  InvalidDocumentData,
  UnexpectedError,
} from "../domain/errors";
import type {
  DocumentFilter,
  OperatorLicenseRepository,
} from "../domain/repositories";
import type { ValidationStatus } from "../domain/valueObjects";
import type { CreateLicenseInput } from "../application/dto";
import { licenseMapper } from "./mappers";
import { operatorLicenseApiSchema } from "./schemas";

/** Traduz erro de transporte em erro de domínio. Um único lugar. */
function toDomainError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  if (error instanceof AxiosError) {
    switch (error.response?.status) {
      case 400:
        return new InvalidDocumentData(error.response.data, error);
      case 404:
        return new DocumentNotFound(error);
      case 503:
        return new ClassifierUnavailable(error);
    }
  }
  return new UnexpectedError(error);
}

/** Decorator: garante que TODO método mapeia erro. */
function guarded<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error) => {
    throw toDomainError(error);
  });
}

const ENDPOINT = "operator-licenses/";

export class HttpOperatorLicenseRepository implements OperatorLicenseRepository {
  findById(id: string): Promise<OperatorLicense> {
    return guarded(async () => {
      const { data } = await AxiosInstance.get(`${ENDPOINT}${id}`);
      return licenseMapper.toEntity(operatorLicenseApiSchema.parse(data));
    });
  }

  find(filter?: DocumentFilter): Promise<OperatorLicense[]> {
    return guarded(async () => {
      const { data } = await AxiosInstance.get(ENDPOINT, {
        params: { user: filter?.userId, validation_status: filter?.validationStatus },
      });
      return operatorLicenseApiSchema.array().parse(data).map(licenseMapper.toEntity);
    });
  }

  create(input: CreateLicenseInput): Promise<OperatorLicense> {
    return guarded(async () => {
      const { data } = await AxiosInstance.post(ENDPOINT, licenseMapper.toApi(input));
      return licenseMapper.toEntity(operatorLicenseApiSchema.parse(data));
    });
  }

  update(id: string, input: Partial<CreateLicenseInput>): Promise<OperatorLicense> {
    return guarded(async () => {
      const { data } = await AxiosInstance.patch(
        `${ENDPOINT}${id}`,
        licenseMapper.toApi(input as CreateLicenseInput),
      );
      return licenseMapper.toEntity(operatorLicenseApiSchema.parse(data));
    });
  }

  remove(id: string): Promise<void> {
    return guarded(async () => {
      await AxiosInstance.delete(`${ENDPOINT}${id}`);
    });
  }

  review(id: string, status: ValidationStatus, note?: string): Promise<OperatorLicense> {
    return guarded(async () => {
      const { data } = await AxiosInstance.patch(`${ENDPOINT}${id}/review`, {
        validation_status: status,
        review_note: note ?? null,
      });
      return licenseMapper.toEntity(operatorLicenseApiSchema.parse(data));
    });
  }
}
```

`guarded` resolve a inconsistência de LSP do serviço atual, onde `listLicenses` (`:70`),
`getLicenseById` (`:81`) e `removeLicense` (`:138`) não têm try/catch e deixam vazar `AxiosError`
cru, enquanto os métodos vizinhos lançam erro de domínio.

### `infrastructure/container.ts`

```ts
import { SubmitLicenseUseCase } from "../application/useCases/submitLicense";
import { ReviewDocumentUseCase } from "../application/useCases/reviewDocument";
import { HttpOperatorLicenseRepository } from "./HttpOperatorLicenseRepository";
import { HttpDocumentClassifier, HttpFileUploader } from "./HttpDocumentClassifier";

const licenseRepository = new HttpOperatorLicenseRepository();
const uploader = new HttpFileUploader();
const classifier = new HttpDocumentClassifier();

export const documentsContainer = {
  licenseRepository,
  submitLicense: new SubmitLicenseUseCase(licenseRepository, uploader, classifier),
  reviewLicense: new ReviewDocumentUseCase(licenseRepository),
};
```

---

## Camada 3 — `presentation/`

### `shared/hooks/useAsync.ts`

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { DomainError } from "@/features/documents/domain/errors";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: DomainError | null;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (mounted.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (mounted.current) {
        setState({ data: null, loading: false, error: error as DomainError });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void run();
  }, [run]);

  return { ...state, refetch: run, setData: (d: T) => setState((s) => ({ ...s, data: d })) };
}
```

> **Limitação declarada** ([ADR-006](../06-adr.md)): sem cache, sem deduplicação de requisições em
> voo, sem revalidação em background. Toda montagem refaz a requisição. É o preço de não adicionar
> TanStack Query.

Substitui o trio `loading` / `erro` / `data` reescrito em `Reservar.tsx:120`,
`AnuncioDetalhe.tsx:77`, `GerenciarAnuncio.tsx:24` e `Admin/Documentos.tsx:100`.

### `presentation/hooks/useOperatorLicenses.ts`

```ts
import { useCallback } from "react";
import { useAsync } from "@/shared/hooks/useAsync";
import { documentsContainer } from "../../infrastructure/container";
import type { ValidationStatus } from "../../domain/valueObjects";

export function useOperatorLicenses(userId: string | null) {
  const { data, loading, error, refetch, setData } = useAsync(
    () =>
      userId
        ? documentsContainer.licenseRepository.find({ userId })
        : Promise.resolve([]),
    [userId],
  );

  const remove = useCallback(
    async (id: string) => {
      await documentsContainer.licenseRepository.remove(id);
      setData((data ?? []).filter((l) => l.id !== id));
    },
    [data, setData],
  );

  const review = useCallback(
    async (id: string, status: ValidationStatus, note?: string) => {
      const updated = await documentsContainer.reviewLicense.execute(id, status, note);
      setData((data ?? []).map((l) => (l.id === id ? updated : l)));
    },
    [data, setData],
  );

  return { licenses: data ?? [], loading, error, refetch, remove, review };
}
```

O hook é o **Adapter**: converte um caso de uso, que não conhece React, no modelo de estado do React.

### `presentation/hooks/useCnhForm.ts`

```ts
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { CPF } from "../../domain/valueObjects";

export const cnhFormSchema = z.object({
  name: z.string().min(1, "Informe o nome."),
  birthDate: z.string().min(1, "Informe a data de nascimento."),
  cpf: z.string().refine((v) => CPF.isValid(v.replace(/\D/g, "")), "CPF inválido."),
  rg: z.string().min(1, "Informe o RG."),
  motherName: z.string().min(1, "Informe o nome da mãe."),
  fatherName: z.string().optional(),
  nationality: z.string().min(1),
  birthCity: z.string().min(1),
  birthState: z.string().length(2),
  cnhNumber: z.string().length(11, "O número da CNH tem 11 dígitos."),
  category: z.enum(["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"]),
  firstLicenseDate: z.string().min(1),
  issueDate: z.string().min(1),
  expirationDate: z.string().min(1),
  issuingState: z.string().length(2),
  issuingAuthority: z.string().min(1),
  situation: z.enum(["active", "expired", "suspended", "revoked", "blocked", "ppd"]),
  acc: z.boolean().default(false),
  ear: z.boolean().default(false),
  medicalRestrictions: z.string().optional(),
  observations: z.string().optional(),
  points: z.coerce.number().int().min(0).max(40),
});

export type CnhFormValues = z.infer<typeof cnhFormSchema>;

export function useCnhForm(defaults?: Partial<CnhFormValues>) {
  return useForm<CnhFormValues>({
    resolver: zodResolver(cnhFormSchema),
    defaultValues: { acc: false, ear: false, points: 0, ...defaults },
    mode: "onBlur",
  });
}
```

**Isto substitui os 22 `useState` de campo de `CNHUpload.tsx:91-127`**, os 20 setters sequenciais
do carregamento e a validação manual via `setCustomValidity` / `reportValidity`.

### `presentation/components/LicenseCard.tsx`

```tsx
import type { OperatorLicense } from "../../domain/entities";

interface Props {
  license: OperatorLicense;
  onRemove: (id: string) => void;
}

/** Apresentacional: props entram, JSX sai. Sem fetch, sem estado de servidor. */
export function LicenseCard({ license, onRemove }: Props) {
  return (
    <article className="rounded-lg border border-outline-variant/30 p-4">
      <header className="flex items-center justify-between">
        <h3 className="font-medium text-on-surface">{license.name}</h3>
        <StatusBadge status={license.validationStatus} />
      </header>

      <dl className="mt-2 text-sm text-on-surface-variant">
        <div><dt>CPF</dt><dd>{license.cpf.masked()}</dd></div>
        <div><dt>Categoria</dt><dd>{license.category}</dd></div>
        <div><dt>Pontos</dt><dd>{license.points}</dd></div>
      </dl>

      {!license.enablesOperation() && license.isApproved && (
        <p className="mt-2 text-sm text-error">
          Esta CNH não habilita operação (vencida, suspensa ou com pontuação excedida).
        </p>
      )}

      <button onClick={() => onRemove(license.id)}>Remover</button>
    </article>
  );
}
```

`license.enablesOperation()` é a regra de domínio disponível na UI, sem recalcular vencimento,
situação e pontos no componente.

### `pages/Documents/CNHUpload.tsx` — composição

```tsx
export default function CNHUpload() {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const { licenses, loading } = useOperatorLicenses(userId);
  const existing = licenses[0];
  const form = useCnhForm(existing ? toFormValues(existing) : undefined);
  const [file, setFile] = useState<File | null>(null);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await documentsContainer.submitLicense.execute(
        { ...values, userId: userId! },
        file ?? undefined,
        existing?.id,
      );
      toast.success(existing ? "CNH atualizada." : "CNH cadastrada.");
      navigate("/dashboard");
    } catch (error) {
      toast.error(error instanceof DomainError ? messageFor(error) : "Erro inesperado.");
    }
  });

  if (loading) return <Spinner />;

  return (
    <form onSubmit={onSubmit}>
      <CnhIdentityFields form={form} />
      <CnhLicenseFields form={form} />
      <CnhFileField file={file} onChange={setFile} />
      <SubmitButton pending={form.formState.isSubmitting} />
    </form>
  );
}
```

**974 linhas → ~35**, com o restante distribuído entre hooks, schema e componentes de campo. A
tradução de erro para texto de UI (`messageFor`) vive na apresentação, onde é responsabilidade dela.

---

## Testes

```ts
import { describe, expect, it } from "vitest";
import { OperatorLicense } from "../domain/entities";
import { BirthPlace, CPF, CnhSituation, ValidationStatus } from "../domain/valueObjects";
import { RejectionRequiresNote } from "../domain/errors";

const build = (over: Partial<ConstructorParameters<typeof OperatorLicense>> = {}) =>
  new OperatorLicense(
    "id", "user", "Fulano",
    CPF.create("11144477735"), "12345678901", "AB",
    new Date("2030-01-01"), CnhSituation.Active, 0,
    new BirthPlace("Curitiba", "PR"),
    ValidationStatus.Approved,
  );

describe("OperatorLicense", () => {
  it("rejeita sem justificativa", () => {
    expect(() => build().reject("  ")).toThrow(RejectionRequiresNote);
  });

  it("CNH vencida não habilita operação", () => {
    const lic = build();
    expect(lic.enablesOperation(new Date("2031-01-01"))).toBe(false);
  });

  it("CPF inválido não é construído", () => {
    expect(() => CPF.create("11111111111")).toThrow();
  });
});
```

> `vitest` **não** está instalado. Este bloco documenta o alvo; adicioná-lo é decisão separada,
> registrada como pendência.

---

## Resultado

| | Antes | Depois |
|---|---|---|
| `OperatorDocumentService.ts` | 253 linhas, metades duplicadas | Repositório por entidade, sem duplicação |
| Métodos sem tratamento de erro | 6 de 12 | 0 — `guarded` cobre todos |
| `CNHUpload.tsx` | 974 linhas, 30 `useState` (22 de formulário) | ~35 linhas + schema + hooks |
| Validação em runtime | Nenhuma | zod na fronteira |
| Texto de UI na camada de infraestrutura | Sim | Não — `code` + `status` |
| Regra "CNH habilita operação" | Inexistente no front | `enablesOperation()` |
| `snake_case` no JSX | Sim | Para no mapper |

Verificação da Regra da Dependência:

```bash
grep -rE "from ['\"](axios|react)" FrontEnd/src/features/documents/domain/
```
