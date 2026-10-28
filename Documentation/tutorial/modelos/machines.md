# Máquinas — `Machines`

O guia de máquinas é o **exemplo completo**: [02_exemplo_maquina_tipo_pneu.md](../02_exemplo_maquina_tipo_pneu.md).

| Tela | Arquivo | Passo do exemplo |
| --- | --- | --- |
| Cadastro (`/dashboard/novo-equipamento`) | `pages/machines/NovoEquipamento.tsx` | 10 |
| Lista "Minha frota" (`/dashboard?tab=frota`) | `pages/dashboard/DashboardLocador.tsx` | 11 |
| Editar (modal) | `components/EditEquipamentoModal.tsx` + `DashboardLocador.tsx` | 12 |

Backend: `BackEnd/machines/` (`models.py`, `serializer.py`, `services.py`, `views.py`, `urls.py`), passos 1 a 6.
