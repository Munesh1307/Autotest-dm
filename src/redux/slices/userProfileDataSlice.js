import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  userDetails: null,
};

const userDetailsSlice = createSlice({
  name: "userDetails",
  initialState,
  reducers: {
    setUserDetails: (state, action) => {
      state.userDetails = action.payload;
    },
    handleResetuserDetails: () => initialState,
  },
});

export const { setUserDetails, handleResetuserDetails } = userDetailsSlice.actions;
export default userDetailsSlice.reducer;
