import bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS } from './constants.js';

export const hashPassword = async (plainPassword) => {
    return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

export const verifyPassword = async (plainPassword, hash) => {
    return bcrypt.compare(plainPassword, hash);
}
