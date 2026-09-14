import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },

    token: {
        type: String,
        required: true
    },

    expiresAt: {
        type: Date,
        required: true,
        index: { expires: '0'}
    },

    isRevoked: {
        type: Boolean,
        default: false
    },
    
}, {
    timestamps: true
});

const refreshTokenModel = mongoose.model('RefreshToken', refreshTokenSchema);

export default refreshTokenModel;