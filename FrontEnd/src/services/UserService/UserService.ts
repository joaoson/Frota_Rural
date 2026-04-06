import type {SignupFormSchema} from "@/pages/Signup/Components/SignupFormSchema.ts";
import {AxiosInstance} from "@/services/AxiosInstance.ts";

class UserService {
    private SIGNUP_ENDPOINT = "users/create"

    async register(data: SignupFormSchema) {
        try {
            const response = await AxiosInstance.post(
                this.SIGNUP_ENDPOINT,
                data
            )
            return response.data;
        } catch (error) {
            console.log(error);
            throw error;
        }
    }
}

export const userService = new UserService();