import "../../App.css";

import * as z from 'zod'
import {type SignupFormSchema, signupFormSchema} from "@/pages/Signup/Components/SignupFormSchema.ts";
import { UserPlus } from 'lucide-react';
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select.tsx";
import {Controller, useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {Field, FieldError, FieldGroup, FieldLabel} from "@/components/ui/field.tsx";
import {maskCPF} from "@/utils/maskCPF.ts";
import {maskCEP} from "@/utils/maskCEP.ts";
import {maskPhone} from "@/utils/maskPhone.ts";
import {userService} from "@/services/UserService/UserService.ts";

function Signup() {

    const signupForm = useForm<SignupFormSchema>({
        resolver: zodResolver(signupFormSchema),
        defaultValues: {
            name: "",
            document: "",
            email: "",
            phone: "",
            role: undefined,
            address: "",
            city: "",
            state: "",
            cep: "",
            password: ""
        },
    })

    // TODO: SHOULD CALCULATE SUM FOR CPF/CNPJ VALIDATION
    async function onSubmit(data: z.infer<typeof signupFormSchema>) {
        try {
            console.log(data)
            const response = await userService.register(data)
            console.log(response)
        } catch (error) {
            console.log(error)
        }
    }

    return (
        <div className="min-h-screen bg-[#FFFBEB] flex items-center justify-center p-4 font-sans">
            <div className="w-full max-w-[550px] bg-white rounded-[32px] shadow-sm p-8 md:p-12 flex flex-col items-center">
                <div className="bg-[#F3F0E6] p-4 rounded-xl mb-6">
                    <UserPlus className="w-8 h-8 text-[#2D3F1E]" />
                </div>

                <h1 className="text-3xl font-bold text-[#1A2414] mb-1">Criar Conta</h1>
                <div className="w-12 h-1 bg-[#F59E0B] mb-4 rounded-full" />
                <p className="text-gray-500 text-sm mb-10">Preencha seus dados para começar</p>

                <form id="lessee-form" className="w-full" onSubmit={signupForm.handleSubmit(onSubmit)}>
                    <div className="space-y-6">
                        <FieldGroup>
                            <Controller
                                name="name"
                                control={signupForm.control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor="lessee-form-name">
                                            NOME COMPLETO
                                        </FieldLabel>
                                        <Input
                                            {...field}
                                            id="lessee-form-name"
                                            aria-invalid={fieldState.invalid}
                                            placeholder="João da Silva"
                                            autoComplete="off"
                                        />
                                        {fieldState.invalid && (
                                            <FieldError errors={[fieldState.error]} />
                                        )}
                                    </Field>
                                )}
                            />
                        </FieldGroup>

                        <FieldGroup>
                            <Controller
                                name="document"
                                control={signupForm.control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor="lessee-form-document">
                                            CPF / CNPJ DO LOCATÁRIO
                                        </FieldLabel>
                                        <Input
                                            {...field}
                                            id="lessee-form-document"
                                            aria-invalid={fieldState.invalid}
                                            placeholder="000.000.000-00"
                                            onChange={(e) => {
                                                const masked = maskCPF(e.target.value);
                                                field.onChange(masked); // This updates the form state with the mask
                                            }}
                                        />
                                        <p className="text-xs">Requisito para formalização de contrato na plataforma.</p>
                                        {fieldState.invalid && (
                                            <FieldError errors={[fieldState.error]} />
                                        )}
                                    </Field>
                                )}
                            />
                        </FieldGroup>

                        <FieldGroup>
                            <Controller
                                name="email"
                                control={signupForm.control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor="lessee-form-email">
                                            E-MAIL
                                        </FieldLabel>
                                        <Input
                                            {...field}
                                            id="lessee-form-email"
                                            aria-invalid={fieldState.invalid}
                                            placeholder="contato@email.com"
                                            autoComplete="off"
                                        />
                                        {fieldState.invalid && (
                                            <FieldError errors={[fieldState.error]} />
                                        )}
                                    </Field>
                                )}
                            />
                        </FieldGroup>

                        <FieldGroup>
                            <Controller
                                name="phone"
                                control={signupForm.control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor="lessee-form-phone">
                                            TELEFONE (OPCIONAL)
                                        </FieldLabel>
                                        <Input
                                            {...field}
                                            id="lessee-form-phone"
                                            aria-invalid={fieldState.invalid}
                                            placeholder="(65) 99999-0000"
                                            autoComplete="off"
                                            onChange={(e) => {
                                                const masked = maskPhone(e.target.value);
                                                field.onChange(masked);
                                            }}
                                        />
                                        {fieldState.invalid && (
                                            <FieldError errors={[fieldState.error]} />
                                        )}
                                    </Field>
                                )}
                            />
                        </FieldGroup>

                        <FieldGroup>
                            <Controller
                                name="address"
                                control={signupForm.control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor="lessee-form-address">
                                            ENDEREÇO
                                        </FieldLabel>
                                        <Input
                                            {...field}
                                            id="lessee-form-address"
                                            aria-invalid={fieldState.invalid}
                                            placeholder="Rua, número, complemento"
                                            autoComplete="off"
                                        />
                                        {fieldState.invalid && (
                                            <FieldError errors={[fieldState.error]} />
                                        )}
                                    </Field>
                                )}
                            />
                        </FieldGroup>

                        <div className="grid grid-cols-2 gap-4">
                            <FieldGroup>
                                <Controller
                                    name="city"
                                    control={signupForm.control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel htmlFor="lessee-form-city">
                                                CIDADE
                                            </FieldLabel>
                                            <Input
                                                {...field}
                                                id="lessee-form-city"
                                                aria-invalid={fieldState.invalid}
                                                placeholder="Sorriso"
                                                autoComplete="off"
                                            />
                                            {fieldState.invalid && (
                                                <FieldError errors={[fieldState.error]} />
                                            )}
                                        </Field>
                                    )}
                                />
                            </FieldGroup>
                            <FieldGroup>
                                <Controller
                                    name="state"
                                    control={signupForm.control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel htmlFor="lessee-form-state">ESTADO</FieldLabel>

                                            <Select
                                                onValueChange={field.onChange}
                                                value={field.value}
                                            >
                                                <SelectTrigger id="lessee-form-state">
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="MT">Mato Grosso</SelectItem>
                                                    <SelectItem value="SP">São Paulo</SelectItem>
                                                    <SelectItem value="RJ">Rio de Janeiro</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {fieldState.invalid && (
                                                <FieldError errors={[fieldState.error]} />
                                            )}
                                        </Field>
                                    )}
                                />
                            </FieldGroup>
                        </div>

                        <FieldGroup>
                            <Controller
                                name="cep"
                                control={signupForm.control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor="lessee-form-cep">
                                            CEP
                                        </FieldLabel>
                                        <Input
                                            {...field}
                                            id="lessee-form-cep"
                                            aria-invalid={fieldState.invalid}
                                            placeholder="00000-00"
                                            onChange={(e) => {
                                                const masked = maskCEP(e.target.value);
                                                field.onChange(masked);
                                            }}
                                        />
                                        {fieldState.invalid && (
                                            <FieldError errors={[fieldState.error]} />
                                        )}
                                    </Field>
                                )}
                            />
                        </FieldGroup>

                        <FieldGroup>
                            <Controller
                                name="role"
                                control={signupForm.control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor="lessee-form-role">TIPO DE CADASTRO</FieldLabel>

                                        <Select
                                            onValueChange={field.onChange}
                                            value={field.value}
                                        >
                                            <SelectTrigger id="lessee-form-role">
                                                <SelectValue placeholder="Selecione" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="locatario">Locatário</SelectItem>
                                                <SelectItem value="locador">Locador</SelectItem>
                                                <SelectItem value="operador">Operador</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {fieldState.invalid && (
                                            <FieldError errors={[fieldState.error]} />
                                        )}
                                    </Field>
                                )}
                            />
                        </FieldGroup>

                        <FieldGroup>
                            <Controller
                                name="password"
                                control={signupForm.control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor="lessee-form-password">
                                            SENHA
                                        </FieldLabel>
                                        <Input
                                            {...field}
                                            type="password"
                                            id="lessee-form-password"
                                            aria-invalid={fieldState.invalid}
                                            placeholder="Mínimo 8 caracteres"
                                        />
                                        {fieldState.invalid && (
                                            <FieldError errors={[fieldState.error]} />
                                        )}
                                    </Field>
                                )}
                            />
                        </FieldGroup>

                        <Button type="submit" className="w-full" size="lg" form="lessee-form">
                            Criar Conta
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Signup;
