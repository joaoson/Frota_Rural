# Users — perfil existente

O passo a passo completo, com os pontos de inserção do seu código atual, está em [04 — Usuários pelo fluxo existente](../04_usuarios_pelo_fluxo_existente.md).

```text
Modelo:      BackEnd/users/models.py → Users.categoria_autoria (já criado)
Entrada:     BackEnd/users/serializer.py → UserUpdateInputSerializer.Meta.fields
Service:     BackEnd/users/services.py → UserService.update → serializer.save()
Saída:       BackEnd/users/serializer.py → UserOutputSerializer
View:        BackEnd/users/views/users.py → UserDetailView.patch / get
Endpoint:    PATCH /api/users/<id> e GET /api/users/<id>
Repository:  FrontEnd/src/features/users/api/UserRepository.ts → updateProfile
Store:       FrontEnd/src/features/users/api/UserStore.ts → updateProfile
Hook:        FrontEnd/src/features/users/hooks/useUsers.ts → useUpdateProfile
Componente:  FrontEnd/src/features/dashboard/components/AccountSection.tsx
```

Não criar um service paralelo de usuários. O `serializer.save()` existente já persiste a FK quando ela entra em `UserUpdateInputSerializer`.

Operadores também são `Users`. Para edição pelo empregador, ampliar especificamente `OperatorUpdateInputSerializer`/`OperatorOutputSerializer` e o fluxo `features/operators`; não adicionar o campo globalmente em `PROFILE_FIELDS` sem querer alterar os outros cadastros.
